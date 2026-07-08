# Analysis scripts

Reproducible DSP analysis behind [`../README.md`](../README.md).

## Dependencies
```bash
pip install numpy scipy soundfile librosa matplotlib
```
`soundfile`/`libsndfile` ≥ 1.1 decodes MP3 directly (no ffmpeg needed).

## Run order
1. `analyze.py` — core metrics (levels, tempo, key, per-band energy, tonal balance, stereo width). Writes `../data/analysis.json` and `arrays.npz`.
2. `plots.py` — arrangement + spectrum/spectrogram figures (needs `arrays.npz`).
3. `refine.py` — integrated LUFS (BS.1770 K-weighting), tempo candidates, bass-note root tracking, refined sections. Writes `../data/refine.json`.
4. `elements.py` — kick-spacing BPM, kick profile, sidechain depth, hi-hat phase. Writes `../data/elements.json`.
5. `tempo_precise.py` — high-precision tempo via parabolic-interpolated autocorrelation.
6. `final_fig.py` — the labelled arrangement/energy map.

Set the input path at the top of each script (`F = ...`) to your audio file.
