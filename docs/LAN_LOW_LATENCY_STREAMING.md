# LAN Low-Latency Streaming (4 Stations + 1 PC)

This profile is optimized for smooth playback and minimum latency on wired LAN.

## Target
- Latency: ~120-250 ms (WebRTC path)
- Stable rendering on TV Spectator pages
- 4 concurrent stations

## 1) Backend (.env)
Set on the central server:

```env
STREAM_BASE_URL=http://<MEDIA_SERVER_IP>:8889/live
STREAM_FALLBACK_MODE=webrtc
```

If a station has no explicit `stream_url`, backend will auto-build:
- `http://<MEDIA_SERVER_IP>:8889/live/station<id>`

## 2) Agent (per station)
In each station `agent/config.json`:

```json
{
  "obs_host": "localhost",
  "obs_port": 4455,
  "obs_password": "",
  "stream_url": "http://<MEDIA_SERVER_IP>:8889/live/station1"
}
```

Use the corresponding station suffix (`station1`, `station2`, etc.).

## 3) OBS Encoder (per station)
- Output resolution: `1280x720`
- FPS: `60`
- Rate control: `CBR`
- Bitrate: `4500-6000 kbps`
- Keyframe interval: `1s`
- Encoder preset/tune: `low latency`

If GPU load is high, use `1920x1080 @ 30fps`.

## 4) Network
- Wired Gigabit LAN only
- Avoid Wi-Fi on stream PCs
- Keep media server and operator PC on same switch/VLAN

## 5) Validation
- Open `/tv/spectator`
- Start stream for each station
- Confirm no stutter and quick switching between stations
- Check backend `/health`, `/health/live`, `/health/ready`

