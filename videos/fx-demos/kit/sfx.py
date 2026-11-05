# The demos' sound effects, made in code (numpy, from Blender's own Python): blender -b -P sfx.py -- <out dir>
# Peaks stay at -6 dB; the final mix sets the loudness.
import numpy as np, os, sys, wave

out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)
SR = 48000
rng = np.random.default_rng(7)


def t_(d):
    return np.arange(int(d * SR)) / SR


def lp(x, fc):
    # One-pole low-pass; fc may vary per sample.
    fc = np.broadcast_to(fc, x.shape)
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.zeros_like(x)
    s = 0.0
    for i in range(len(x)):
        s += a[i] * (x[i] - s)
        y[i] = s
    return y


def hp(x, fc):
    return x - lp(x, fc)


def bp(x, f1, f2):
    return hp(lp(x, f2), f1)


def sine_sweep(f0, f1, d, curve=2.0):
    t = t_(d)
    f = f0 + (f1 - f0) * (t / d) ** curve
    return np.sin(2 * np.pi * np.cumsum(f) / SR), f


def save(name, x, pan=0.0):
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        l, r = x * (1 - max(pan, 0)), x * (1 + min(pan, 0))
        x = np.stack([l, r], 1)
    x = x / (np.abs(x).max() + 1e-9) * 0.5
    n = min(int(0.004 * SR), len(x) // 2)
    x[-n:] *= np.linspace(1, 0, n)[:, None]
    with wave.open(os.path.join(out, name + ".wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def whoosh(d, f0, f1, pan0=-0.6, pan1=0.6):
    t = t_(d)
    n = rng.standard_normal(len(t))
    fc = f0 * (f1 / f0) ** (t / d)
    env = np.sin(np.pi * (t / d) ** 0.8) ** 2
    x = lp(hp(n, fc * 0.5), fc * 1.6) * env
    p = pan0 + (pan1 - pan0) * t / d
    return np.stack([x * (1 - np.clip(p, 0, 1)), x * (1 + np.clip(p, -1, 0))], 1)


save("whoosh_a", whoosh(0.55, 500, 4200))
save("whoosh_b", whoosh(0.8, 300, 2600, 0.6, -0.6))
save("whoosh_c", whoosh(0.4, 900, 6500))


def impact(d, f0, f1, click=0.5):
    s, _ = sine_sweep(f0, f1, d, 0.6)
    t = t_(d)
    x = s * np.exp(-t * 4.5)
    n = rng.standard_normal(len(t))
    x += click * lp(n, 2500) * np.exp(-t * 60)
    return x


save("impact_low", impact(1.4, 95, 30))
save("impact_mid", impact(0.7, 170, 55, 0.8))
save("thud_a", impact(0.22, 150, 60, 0.4))
save("thud_b", impact(0.18, 210, 80, 0.5))


def glassy(d, parts, decay):
    t = t_(d)
    x = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * a * np.exp(-t * decay * (1 + f / 4000)) for f, a in parts)
    return x


save("glass_knock", glassy(0.45, [(1900, 1), (3120, 0.7), (4710, 0.5), (6900, 0.3)], 11) + 0.6 * impact(0.45, 200, 90, 0.3))
save("glass_click", glassy(0.14, [(2800, 1), (5200, 0.6)], 40))


def shatter(d=1.0, n=90):
    x = np.zeros(int(d * SR))
    for _ in range(n):
        at = int((rng.random() ** 2.2) * (len(x) - 6000))
        g = glassy(0.12, [(rng.uniform(2500, 9000), 1), (rng.uniform(5000, 12000), 0.6)], 55) * rng.uniform(0.2, 1)
        x[at:at + len(g)] += g
    x += 0.6 * hp(rng.standard_normal(len(x)), 3000) * np.exp(-t_(d) * 7)
    x[:int(0.5 * SR)] += 1.2 * impact(0.5, 160, 60, 0.6)
    return x


save("shatter", shatter())


def tick(f=3200):
    t = t_(0.03)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 260) + 0.5 * rng.standard_normal(len(t)) * np.exp(-t * 500)


save("tick_a", tick(3000))
save("tick_b", tick(3900))
save("tick_c", tick(2500))
s, _ = sine_sweep(380, 950, 0.09, 1.0)
save("pop", s * np.exp(-t_(0.09) * 30))
s, _ = sine_sweep(160, 90, 0.2, 1.0)
save("stamp", 0.8 * s * np.exp(-t_(0.2) * 22) + 0.9 * lp(rng.standard_normal(int(0.2 * SR)), 1800) * np.exp(-t_(0.2) * 45))


def riser(d=2.6):
    t = t_(d)
    fc = 200 * (9000 / 200) ** ((t / d) ** 1.6)
    n = lp(hp(rng.standard_normal(len(t)), fc * 0.6), fc * 1.5)
    s, _ = sine_sweep(70, 620, d, 2.2)
    return (0.8 * n + 0.25 * s) * (t / d) ** 2.2


save("riser", riser())
save("riser_short", riser(1.2))
s, _ = sine_sweep(70, 26, 1.8, 0.7)
save("sub_drop", s * np.exp(-t_(1.8) * 1.9))
s, f = sine_sweep(420, 40, 0.8, 0.8)
save("power_down", lp(np.sign(s) * 0.5 + s, 2200) * np.linspace(1, 0.1, len(s)))
s, f = sine_sweep(50, 520, 0.28, 1.2)
save("power_up", lp(np.sign(s) * 0.4 + s, 3000) * np.sin(np.pi * np.linspace(0, 1, len(s))))


def servo(d, f0, f1):
    t = t_(d)
    f = f0 + (f1 - f0) * t / d + 26 * np.sin(2 * np.pi * 38 * t)
    s = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR))
    return lp(s, 1800) * np.sin(np.pi * t / d) ** 0.5


save("servo_a", servo(0.28, 520, 780))
save("servo_b", servo(0.36, 760, 430))
save("servo_c", servo(0.18, 980, 1250))


def engine(d, f0, f1, curve=1.4):
    # An exhaust: firing pulses at a rising rate through a throaty resonance, then a little grit.
    t = t_(d)
    f = f0 + (f1 - f0) * (t / d) ** curve
    ph = np.cumsum(f) / SR
    pulses = (ph % 1.0) ** 6 * 2 - 0.4
    x = lp(pulses, 900 + f * 6) + 0.25 * np.sin(2 * np.pi * ph * 0.5)
    x += 0.10 * lp(rng.standard_normal(len(t)), 3000) * (0.2 + (t / d))
    x = np.tanh(x * 2.4)
    return x


rev = engine(2.3, 70, 330)
save("engine_rev", rev * np.minimum(1, t_(2.3) * 6))
idle = engine(1.6, 58, 62, 1.0)
save("engine_idle", idle * np.minimum(1, t_(1.6) * 8) * np.minimum(1, (1.6 - t_(1.6)) * 5))
d = engine(1.1, 300, 90, 0.6)
save("engine_down", d * np.minimum(1, (1.1 - t_(1.1)) * 6))
t = t_(1.0)
sk = bp(rng.standard_normal(len(t)), 1400, 4200) * (0.65 + 0.35 * np.sin(2 * np.pi * 34 * t)) * np.sin(np.pi * (t / 1.0) ** 0.6) ** 0.7
save("skid", sk)
t = t_(0.4)
save("bleep", np.sin(2 * np.pi * 1000 * t) * np.minimum(1, t * 200) * np.minimum(1, (0.4 - t) * 200))
t = t_(4.0)
save("hum", lp(sum(np.sin(2 * np.pi * f * t) * a for f, a in [(55, 1), (110, 0.5), (165, 0.18)]) + 0.04 * rng.standard_normal(len(t)), 500) * np.minimum(1, t * 2) * np.minimum(1, (4 - t) * 2))
print("SFX_DONE", len(os.listdir(out)))
