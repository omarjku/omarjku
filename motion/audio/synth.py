#!/usr/bin/env python3
"""Procedural soundtrack for a scene: drums, bass, pads, arps and FX, synthesised
sample by sample with numpy. No samples, no models: every sound is an oscillator,
a noise source and a filter, arranged from a small score that the scene exports.

    python3 synth.py score.json out.wav

The score (see SCORE_EXAMPLE) gives the tempo, one chord per bar, and sections
(intro, build, drop, break, outro) that decide which instruments play. Hits,
whooshes and ticks are placed at the exact seconds the picture cuts on.
"""
import json
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
RNG = np.random.default_rng(7)

SCORE_EXAMPLE = {
    "bpm": 120, "length": 25.0,
    "chords": ["Am", "F", "C", "G"],               # one per bar, cycled
    "sections": [{"from": 0, "to": 2, "type": "intro"}, {"from": 2, "to": 4, "type": "build"},
                 {"from": 4, "to": 10, "type": "drop"}, {"from": 10, "to": 11, "type": "break"},
                 {"from": 11, "to": 13, "type": "outro"}],
    "hits": [8.0], "whooshes": [], "ticks": [],
    "style": {"bass": "offbeat", "arp": "up", "pad": 1.0, "drums": 1.0, "brightness": 1.0,
              "snare": "clap", "punch": 1.0, "hats": 1.0, "arp_level": 1.0},
}

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
        "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
QUALITY = [("maj7", [0, 4, 7, 11]), ("m7", [0, 3, 7, 10]), ("7", [0, 4, 7, 10]), ("sus2", [0, 2, 7]),
           ("sus4", [0, 5, 7]), ("add9", [0, 4, 7, 14]), ("m", [0, 3, 7]), ("", [0, 4, 7])]


# ---------------------------------------------------------------- music theory
def parse_chord(name):
    root = name[0]
    rest = name[1:]
    if rest[:1] in ("#", "b"):
        root += rest[0]
        rest = rest[1:]
    for q, iv in QUALITY:
        if rest.startswith(q):
            return NOTE[root], iv
    return NOTE[root], [0, 4, 7]


def voicing(name, lo=55):
    """Close voicing with every tone in [lo, lo + 12): smooth voice leading for free."""
    root, iv = parse_chord(name)
    notes = sorted({lo + ((root + i - lo) % 12) for i in iv})
    return notes


def bass_note(name, octave=2):
    root, _ = parse_chord(name)
    return 12 * (octave + 1) + root


def hz(m):
    return 440.0 * 2 ** ((np.asarray(m, float) - 69) / 12)


# ---------------------------------------------------------------- building blocks
def t_axis(n):
    return np.arange(n) / SR


def saw(freq, n):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    dt = f / SR
    ph = (RNG.random() + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y


def sine(freq, n, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    return np.sin(phase + 2 * np.pi * np.cumsum(f) / SR)


def noise(n):
    return RNG.standard_normal(n)


def filt(x, kind, fc, order=2):
    fc = np.clip(fc, 20, SR / 2 - 100)
    sos = signal.butter(order, fc, kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def sweep(x, fcs, kind="lowpass", block=256, q_order=2):
    """Time-varying Butterworth filter: coefficients per block, state carried over."""
    y = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        fc = float(np.clip(fcs[min(i, len(fcs) - 1)], 30, SR / 2 - 200))
        sos = signal.butter(q_order, fc, kind, fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        y[i:i + block], zi = signal.sosfilt(sos, x[i:i + block], zi=zi)
    return y


def env_adsr(n, a, d, s, r, hold):
    """Attack/decay/sustain/release envelope over n samples; hold = seconds before release."""
    t = t_axis(n)
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = t > hold
    e[rel] *= np.exp(-(t[rel] - hold) / max(r, 1e-4))
    return e


def place(buf, x, start, gain=1.0, pan=0.0):
    """Add mono x into stereo buf at second `start` with constant-power pan."""
    i = int(round(start * SR))
    if i >= buf.shape[1] or i + len(x) <= 0:
        return
    j = min(buf.shape[1], i + len(x))
    s = max(0, -i)
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, max(i, 0):j] += x[s:j - i] * gain * l
    buf[1, max(i, 0):j] += x[s:j - i] * gain * r


def reverb(st, seconds=2.4, wet=0.25, tone=5000):
    n = int(seconds * SR)
    t = t_axis(n)
    out = np.empty_like(st)
    for c in range(2):
        ir = noise(n) * np.exp(-t / (seconds / 6.0))
        ir = filt(ir, "lowpass", tone)
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        out[c] = signal.fftconvolve(st[c], ir)[: st.shape[1]]
    return st * (1 - wet) + out * wet * 1.6


def delay(st, seconds, fb=0.35, wet=0.3, repeats=6, pingpong=True):
    d = int(seconds * SR)
    n = st.shape[1]
    out = st.copy()
    for k in range(1, repeats + 1):
        sh = k * d
        if sh >= n:
            break
        g = wet * fb ** (k - 1)
        for c in range(2):
            source = st[1 - c] if (pingpong and k % 2) else st[c]
            out[c, sh:] += source[: n - sh] * g
    return out


# ---------------------------------------------------------------- instruments
def kick(punch=1.0):
    n = int(0.55 * SR)
    t = t_axis(n)
    f = 44 + 120 * np.exp(-t / 0.032)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.30)
    click = filt(noise(n), "highpass", 2500) * np.exp(-t / 0.0025) * 0.35
    return np.tanh(1.6 * punch * (body + click)) * 0.9


def clap():
    n = int(0.45 * SR)
    t = t_axis(n)
    e = sum(np.exp(-np.clip(t - o, 0, None) / 0.006) * (t >= o) for o in (0, 0.011, 0.022))
    e = e * 0.6 + np.exp(-t / 0.14) * 0.5
    return filt(filt(noise(n), "highpass", 900), "lowpass", 5200) * e * 0.55


def snare():
    n = int(0.35 * SR)
    t = t_axis(n)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.07) * 0.5
    nz = filt(noise(n), "highpass", 1400) * np.exp(-t / 0.12)
    return (tone + nz) * 0.5


def hat(open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    t = t_axis(n)
    x = filt(noise(n), "highpass", 7500, 4) * np.exp(-t / (0.16 if open_ else 0.022))
    return x * (0.22 if open_ else 0.18)


def tick():
    n = int(0.05 * SR)
    t = t_axis(n)
    return np.sin(2 * np.pi * 2200 * t) * np.exp(-t / 0.008) * 0.25


def impact():
    n = int(3.5 * SR)
    t = t_axis(n)
    f = 30 + 30 * np.exp(-t / 0.25)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 1.1)
    crack = filt(noise(n), "lowpass", 3000) * np.exp(-t / 0.18) * 0.6
    return np.tanh(1.3 * (boom + crack)) * 0.9


def riser(seconds):
    n = int(seconds * SR)
    t = t_axis(n)
    p = t / seconds
    fc = 250 * (40 ** p)
    nz = sweep(noise(n), fc, "bandpass" if False else "lowpass")
    nz = filt(nz, "highpass", 200)
    tone = saw(110 * (2 ** (2 * p)), n) * 0.15
    tone = sweep(tone, 400 + 5000 * p, "lowpass")
    return (nz * 0.45 + tone) * (p ** 2.2) * 0.8


def whoosh(seconds=0.5):
    n = int(seconds * SR)
    t = t_axis(n)
    p = t / seconds
    fc = 300 + 6000 * np.sin(np.pi * p) ** 2
    x = sweep(noise(n), fc, "lowpass")
    return filt(x, "highpass", 250) * np.sin(np.pi * p) ** 2 * 0.5


def downlifter(seconds=1.6):
    n = int(seconds * SR)
    t = t_axis(n)
    f = 60 + 500 * np.exp(-t / 0.35)
    return sine(f, n) * np.exp(-t / 0.7) * 0.4


def supersaw(midi, seconds, cutoff, voices=5, spread=0.16):
    n = int(seconds * SR)
    x = np.zeros(n)
    for k in range(voices):
        det = (k - (voices - 1) / 2) / ((voices - 1) / 2 or 1) * spread
        x += saw(hz(midi + det), n)
    x /= voices
    return filt(x, "lowpass", cutoff)


def pluck(midi, seconds, bright=1.0):
    n = int(seconds * SR)
    t = t_axis(n)
    x = saw(hz(midi), n) * 0.6 + saw(hz(midi + 12.03), n) * 0.25
    fc = 350 + 4200 * bright * np.exp(-t / 0.09)
    x = sweep(x, fc, "lowpass")
    return x * np.exp(-t / 0.22)


def bell(midi, seconds):
    n = int(seconds * SR)
    t = t_axis(n)
    f = hz(midi)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t / 0.4)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t / 0.9) * 0.4


def bass_note_sound(midi, seconds, bright=1.0):
    n = int(seconds * SR)
    t = t_axis(n)
    x = saw(hz(midi), n) * 0.65 + np.sin(2 * np.pi * hz(midi) * t) * 0.45
    fc = 180 + 900 * bright * np.exp(-t / 0.08)
    x = sweep(x, fc, "lowpass")
    e = env_adsr(n, 0.004, 0.25, 0.75, 0.04, seconds - 0.04)
    return np.tanh(1.4 * x * e) * 0.8


# ---------------------------------------------------------------- arrangement
def section_at(score, bar):
    for s in score["sections"]:
        if s["from"] <= bar < s["to"]:
            return s["type"]
    return "outro"


def render(score):
    bpm = score["bpm"]
    beat = 60.0 / bpm
    bar_len = 4 * beat
    length = score["length"]
    style = {**SCORE_EXAMPLE["style"], **score.get("style", {})}
    n = int((length + 3.5) * SR)
    nbars = int(np.ceil(length / bar_len))
    chords = score["chords"]

    drums = np.zeros((2, n))
    bass = np.zeros((2, n))
    pads = np.zeros((2, n))
    arps = np.zeros((2, n))
    fx = np.zeros((2, n))
    kicks = []

    for b in range(nbars):
        t0 = b * bar_len
        if t0 >= length:
            break
        sec = section_at(score, b)
        ch = chords[b % len(chords)]
        notes = voicing(ch)
        nxt = section_at(score, b + 1)

        # pads: every section, darker in the intro, sustained over the bar
        if True:
            cutoff = {"intro": 900, "build": 1400, "drop": 2600, "break": 1700, "outro": 1200}[sec]
            cutoff *= style["brightness"]
            hold = bar_len + 0.35
            for m in notes + [notes[0] + 12]:
                x = supersaw(m, hold + 0.9, cutoff) * env_adsr(int((hold + 0.9) * SR), 0.25, 1.0, 0.85, 0.5, hold)
                place(pads, x, t0, 0.11 * style["pad"], pan=RNG.uniform(-0.5, 0.5))

        # arpeggio: 16ths over chord tones, opens up after the intro
        if sec in ("intro", "build", "drop", "break"):
            seq = notes + [notes[0] + 12, notes[1] + 12] if style["arp"] == "up" else notes[::-1] + [notes[-1] - 12]
            steps = 16 if sec != "intro" else 8
            step = bar_len / steps
            bright = {"intro": 0.35, "build": 0.6 + 0.4 * ((b - 0) % 2), "drop": 1.0, "break": 0.55}[sec]
            for k in range(steps):
                m = seq[k % len(seq)] + 12
                place(arps, pluck(m, step * 2.2, bright * style["brightness"]), t0 + k * step,
                      0.10 * style["arp_level"], pan=0.35 * np.sin(k * 1.3))

        # drums
        if sec == "drop":
            for k in range(4):
                tk = t0 + k * beat
                place(drums, kick(style["punch"]), tk, 0.95 * style["drums"])
                kicks.append(tk)
                hl = style["drums"] * style["hats"]
                place(drums, hat(), tk + beat / 2, 0.9 * hl, pan=0.2)
                place(drums, hat(), tk + beat / 4, 0.35 * hl, pan=-0.25)
                place(drums, hat(), tk + 3 * beat / 4, 0.35 * hl, pan=-0.25)
                if k % 2 == 1 and style["snare"] == "clap":
                    place(drums, clap(), tk, 0.75 * style["drums"])
                elif k % 2 == 1 and style["snare"] == "rim":
                    place(drums, snare(), tk, 0.4 * style["drums"])
            if nxt != "drop":   # fill into the next section
                for k in range(4):
                    place(drums, snare(), t0 + 3 * beat + k * beat / 4, 0.35 + 0.1 * k)
        elif sec == "build":
            # snare roll that doubles in speed each half bar of the build
            bars_in = [s for s in score["sections"] if s["type"] == "build" and s["from"] <= b < s["to"]][0]
            prog = (b - bars_in["from"]) / max(1, bars_in["to"] - bars_in["from"])
            div = 4 if prog < 0.5 else 8
            for k in range(div):
                lvl = 0.15 + 0.5 * (prog + k / div / max(1, bars_in["to"] - bars_in["from"]))
                place(drums, snare(), t0 + k * bar_len / div, lvl * style["drums"], pan=0.1)
            if b == bars_in["to"] - 1:
                for k in range(8):
                    place(drums, snare(), t0 + 3 * beat + k * beat / 8, (0.4 + k * 0.06) * style["drums"])
            place(drums, kick(0.7), t0, 0.55 * style["drums"])
            kicks.append(t0)
        elif sec == "break":
            place(drums, kick(0.6), t0, 0.5 * style["drums"])
            place(drums, clap(), t0 + 2 * beat, 0.35 * style["drums"])
        elif sec == "intro":
            for k in range(4):
                place(drums, hat(), t0 + k * beat + beat / 2, 0.25, pan=0.3)

        # bass
        if sec in ("drop", "break", "build"):
            root = bass_note(ch)
            if sec == "drop" and style["bass"] == "offbeat":
                for k in range(4):
                    place(bass, bass_note_sound(root, beat / 2), t0 + k * beat + beat / 2, 0.5)
                    place(bass, bass_note_sound(root + 12, beat / 4, 0.6), t0 + k * beat + 3 * beat / 4, 0.25)
            elif sec == "drop" and style["bass"] == "rolling":
                for k in range(8):
                    place(bass, bass_note_sound(root + (12 if k % 4 == 3 else 0), beat / 2.2), t0 + k * beat / 2, 0.45)
            elif sec == "drop":   # "sustain": held halves, calmer and more cinematic
                for k in range(2):
                    place(bass, bass_note_sound(root, 2 * beat * 0.96, 0.5), t0 + 2 * k * beat, 0.42)
            else:
                lvl = 0.22 if sec == "build" else 0.32
                place(bass, bass_note_sound(root, bar_len * 0.95, 0.35), t0, lvl)

    # risers into every drop, impacts on drop starts
    for s in score["sections"]:
        if s["type"] == "build":
            secs = (s["to"] - s["from"]) * bar_len
            place(fx, riser(secs), s["from"] * bar_len, 0.55)
        if s["type"] in ("drop", "outro") and s["from"] > 0:
            prev = section_at(score, s["from"] - 1)
            if prev in ("build", "break", "drop") and prev != s["type"]:
                place(fx, impact(), s["from"] * bar_len, 0.8)
                place(fx, downlifter(), s["from"] * bar_len, 0.5)

    for h in score.get("hits", []):
        place(fx, impact(), h, 0.55)
    for w in score.get("whooshes", []):
        place(fx, whoosh(0.45), w - 0.22, 0.6, pan=RNG.uniform(-0.6, 0.6))
    for tk in score.get("ticks", []):
        place(fx, tick(), tk, 0.6, pan=RNG.uniform(-0.4, 0.4))
    for bl in score.get("bells", []):
        place(fx, bell(bl[1], 2.5), bl[0], 0.35)

    # sidechain: pads, bass and arps duck under every kick
    t = t_axis(n)
    duck = np.ones(n)
    for tk in kicks:
        i = int(tk * SR)
        j = min(n, i + int(0.35 * SR))
        tt = t[i:j] - tk
        duck[i:j] = np.minimum(duck[i:j], 1 - 0.65 * np.exp(-tt / 0.11) * np.clip(tt / 0.004, 0, 1))
    for buf in (pads, bass, arps):
        buf *= duck

    arps = delay(arps, 0.75 * beat, fb=0.38, wet=0.32)
    pads = reverb(pads, 3.0, 0.35, 4500)
    arps = reverb(arps, 2.2, 0.22, 6000)
    fx = reverb(fx, 2.8, 0.3, 6000)
    drums = drums + reverb(drums, 1.2, 1.0, 5000) * 0.12

    mix = drums + bass + pads + arps + fx
    mix = np.vstack([filt(mix[0], "highpass", 28), filt(mix[1], "highpass", 28)])

    # glue: slow RMS compressor, then soft clip and normalise
    rms = np.sqrt(signal.lfilter([0.0005], [1, -0.9995], (mix ** 2).mean(0)) + 1e-9)
    thr = 0.18
    gain = np.where(rms > thr, (thr / rms) ** 0.5, 1.0)
    mix *= gain
    mix = np.tanh(mix * 1.15)
    end = int(length * SR)
    fade = int(min(2.5, length * 0.15) * SR)
    mix[:, end - fade:end] *= np.linspace(1, 0, fade)
    mix = mix[:, :end]
    mix /= np.max(np.abs(mix)) + 1e-9
    return mix * 10 ** (-1 / 20)


def write_wav(path, st):
    data = (np.clip(st.T, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


if __name__ == "__main__":
    score = json.load(open(sys.argv[1])) if len(sys.argv) > 1 and sys.argv[1] != "-" else SCORE_EXAMPLE
    out = sys.argv[2] if len(sys.argv) > 2 else "out.wav"
    if "seed" in score:
        RNG = np.random.default_rng(score["seed"])
    write_wav(out, render(score))
    print(out)
