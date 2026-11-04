"""De una pieza de la semana a un Reel 9:16: cuadros, clips, voz y armado, a partir de una ficha JSON.

  ~/.believe/bin/infra uv run -q --with requests --with pillow python3 tools/reel.py <ficha.json> [voz musica cuadros clips armar]

Sin pasos corre todos. Cada paso reusa lo que ya existe en la carpeta de la ficha: para rehacer algo, borra ese archivo.
Costos: cuadros y clips en fal, voz en ElevenLabs; `armar` es local y gratis. Formato de la ficha en references/video.md.
"""
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

W, H, FPS = 1080, 1920, 30
ASSETS = os.environ.get("REEL_ASSETS") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "reel")
SFX = os.path.join(ASSETS, "sfx")
ez = lambda x: 1 - (1 - min(1, max(0, x))) ** 3
RE_PUNT = ".,:;¿?¡!%\"'"


def cuadros(f, d):
    import requests
    os.makedirs(f"{d}/cuadros", exist_ok=True)

    def gen(p):
        ruta = f"{d}/cuadros/{p['id']}.png"
        if os.path.exists(ruta) or not p.get("cuadro"):
            return p["id"] + " ya"
        r = requests.post("https://fal.run/fal-ai/nano-banana-pro", timeout=600,
                          headers={"Authorization": "Key " + os.environ["FAL_API_KEY"]},
                          json={"prompt": f["estilo_cuadro"] + " " + p["cuadro"], "num_images": 1, "aspect_ratio": "9:16",
                                "resolution": "2K", "output_format": "png"}).json()
        if "images" not in r:
            return f"{p['id']} FALLÓ {json.dumps(r)[:200]}"
        open(ruta, "wb").write(requests.get(r["images"][0]["url"], timeout=300).content)
        return p["id"] + " ok"

    with ThreadPoolExecutor(6) as ex:
        salidas = list(ex.map(gen, f["planos"]))
    print(*salidas, sep="\n")
    if any("FALLÓ" in x for x in salidas):
        sys.exit("Falló al menos un plano.")


def clips(f, d):
    import base64
    import io
    import time
    import requests
    from PIL import Image
    h = {"Authorization": "Key " + os.environ["FAL_API_KEY"]}
    os.makedirs(f"{d}/clips", exist_ok=True)

    def gen(p):
        ruta = f"{d}/clips/{p['id']}.mp4"
        if os.path.exists(ruta) or not p.get("movimiento"):
            return p["id"] + " ya"
        b = io.BytesIO()
        Image.open(f"{d}/cuadros/{p['id']}.png").convert("RGB").save(b, "JPEG", quality=92)
        r = requests.post("https://queue.fal.run/alibaba/wan-3.0-prime/image-to-video", headers=h, timeout=120,
                          json={"prompt": p["movimiento"] + " " + f["estilo_video"], "duration": 5, "negative_prompt": f["negativo"],
                                "start_image_url": "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()}).json()
        if "request_id" not in r:
            return f"{p['id']} FALLÓ {json.dumps(r)[:200]}"
        for _ in range(240):
            time.sleep(10)
            if requests.get(r["status_url"], headers=h, timeout=60).json().get("status") == "COMPLETED":
                break
        s = requests.get(r["response_url"], headers=h, timeout=60).json()
        if "video" not in s:
            return f"{p['id']} FALLÓ {json.dumps(s)[:200]}"
        open(ruta, "wb").write(requests.get(s["video"]["url"], timeout=600).content)
        return p["id"] + " ok"

    with ThreadPoolExecutor(6) as ex:
        salidas = list(ex.map(gen, f["planos"]))
    print(*salidas, sep="\n")
    if any("FALLÓ" in x for x in salidas):
        sys.exit("Falló al menos un plano.")


def voz(f, d):
    import requests
    k = {"xi-api-key": os.environ["elevenlabs_api_key"]}
    v = f["voz"]
    if not os.path.exists(f"{d}/voz_cruda.mp3"):
        r = requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{v['id']}?output_format=mp3_44100_128", headers=k, timeout=300,
                          json={"text": v["tag"] + " " + v["texto"], "model_id": "eleven_v3", "language_code": "es",
                                "voice_settings": {"stability": 0.5}})
        if r.status_code != 200:
            sys.exit(f"Voz falló {r.status_code}: {r.text[:200]}")
        open(f"{d}/voz_cruda.mp3", "wb").write(r.content)
    # la velocidad se ajusta sobre la toma guardada: cambiarla no paga otra voz
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{d}/voz_cruda.mp3", "-af", f"atempo={v.get('velocidad', 1)}", "-b:a", "192k", f"{d}/voz.mp3"], check=True)
    s = requests.post("https://api.elevenlabs.io/v1/speech-to-text", headers=k, timeout=300, files={"file": open(f"{d}/voz.mp3", "rb")},
                      data={"model_id": "scribe_v1", "language_code": "spa", "timestamps_granularity": "word"}).json()
    pal = [{"w": x["text"], "a": x["start"], "b": x["end"]} for x in s["words"] if x.get("type") == "word"]
    json.dump(pal, open(f"{d}/palabras.json", "w"), ensure_ascii=False, indent=1)
    print(round(pal[-1]["b"], 2), "s:", " ".join(x["w"] for x in pal))


def musica(f, d):
    """Cama musical con ElevenLabs Music por fal. En el Mac de Jorge se puede dejar musica.wav hecha con audio-studio."""
    import requests
    if os.path.exists(f"{d}/{f['musica']}") or not f.get("musica_prompt"):
        print("musica ya")
        return
    r = requests.post("https://fal.run/fal-ai/elevenlabs/music", headers={"Authorization": "Key " + os.environ["FAL_API_KEY"]}, timeout=600,
                      json={"prompt": f["musica_prompt"], "music_length_ms": int(f.get("musica_ms", 24000)), "force_instrumental": True}).json()
    if "audio" not in r:
        sys.exit(f"Música falló: {json.dumps(r)[:200]}")
    open(f"{d}/musica.mp3", "wb").write(requests.get(r["audio"]["url"], timeout=300).content)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{d}/musica.mp3", "-ar", "48000", "-ac", "2", f"{d}/{f['musica']}"], check=True)
    print("musica ok")


def tiempos(f, d):
    """Todos los tiempos salen de la voz: cada plano y cada texto se anclan a una palabra ('tres#2' es la segunda vez)."""
    pal = json.load(open(f"{d}/palabras.json"))
    t0 = f.get("voz_inicio", .5)

    def en(ancla):
        w, n = (ancla.split("#") + ["1"])[:2]
        vistas = [x for x in pal if x["w"].lower().strip(RE_PUNT) == w]
        if len(vistas) < int(n):
            sys.exit(f"La voz no dice '{ancla}'. Dijo: {' '.join(x['w'] for x in pal)}")
        return t0 + vistas[int(n) - 1]["a"]

    planos = [dict(p, t=0. if i == 0 else en(p["desde"]) - .12) for i, p in enumerate(f["planos"])]
    for p in planos:
        p["textos"] = [dict(x, seg=en(x["en"])) for x in p.get("texto", [])]
    fin_voz = t0 + pal[-1]["b"]
    cierre = fin_voz + f["cierre"].get("tras_voz", .15)
    return planos, fin_voz, cierre, cierre + f["cierre"].get("dura", 1.3)


def color(hexa):
    return tuple(int(hexa[i:i + 2], 16) for i in (1, 3, 5))


def armar(f, d):
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    planos, fin_voz, cierre, total = tiempos(f, d)
    acento, fondo = color(f["acento"]), color(f["fondo"])
    logo = Image.open(f"{d}/{f['logo']}").convert("RGBA")
    fuentes = f.get("fuentes") or {"s": "Lato-Bold.ttf", "b": "Lato-Black.ttf"}
    fnt = lambda t, tam: ImageFont.truetype(f"{d}/{fuentes[t]}" if os.path.exists(f"{d}/{fuentes[t]}") else f"{ASSETS}/{fuentes[t]}", tam)
    TAM = {"s": 52, "b": 112, "n": 170, "cta": 50}

    def pieza(x, k):
        tipo, tam = x["tipo"], TAM[x["tipo"]]
        fu = fnt("s" if tipo in ("s", "cta") else "b", tam)
        while fu.getbbox(x["t"])[2] > W - 120:
            tam -= 4
            fu = fnt("s" if tipo in ("s", "cta") else "b", tam)
        bb = fu.getbbox(x["t"])
        m = 70
        c = Image.new("RGBA", (bb[2] - bb[0] + 2 * m, bb[3] - bb[1] + 2 * m))
        if tipo == "n":  # número en círculo sólido: en color suelto se pierde sobre fondos del mismo tono
            lado = bb[3] - bb[1] + 2 * m
            c = Image.new("RGBA", (lado, lado))
            dr = ImageDraw.Draw(c)
            dr.ellipse([m // 3, m // 3, lado - m // 3, lado - m // 3], fill=(*acento, 255))
            dr.text(((lado - bb[2] + bb[0]) // 2 - bb[0], m - bb[1]), x["t"], font=fu, fill=(255, 255, 255, 255))
        else:
            ImageDraw.Draw(c).text((m - bb[0], m - bb[1]), x["t"], font=fu, fill=(255, 255, 255, 255))
        brillo = Image.new("RGBA", c.size, (*acento, 0))
        brillo.putalpha(c.getchannel("A").filter(ImageFilter.GaussianBlur(22 if tipo != "s" else 12)))
        negro = Image.new("RGBA", c.size, (0, 8, 30, 0))
        negro.putalpha(c.getchannel("A").filter(ImageFilter.GaussianBlur(26)).point(lambda v: min(255, v * 3)))
        if tipo == "n":
            brillo.putalpha(0)
        im = Image.alpha_composite(Image.alpha_composite(negro, brillo), c)
        # llega frenando desde más grande, no aparece ni crece desde cero
        e = ez(k / .3)
        esc = 1 + (.3 if tipo in ("b", "n") else .08) * (1 - e)
        if esc != 1:
            im = im.resize((int(im.width * esc), int(im.height * esc)))
        im.putalpha(im.getchannel("A").point(lambda v: int(v * min(1, k / .12))))
        return im, m

    def con_logo(im, ancho, y, a=1.):
        l = logo.resize((ancho, int(ancho * logo.height / logo.width)))
        if a < 1:
            l.putalpha(l.getchannel("A").point(lambda v: int(v * a)))
        im.alpha_composite(l, ((W - ancho) // 2, y))

    def cuadro(s):
        im = Image.new("RGBA", (W, H))
        if s < cierre:
            con_logo(im, 340, 110)
        i = max(j for j, p in enumerate(planos) if p["t"] <= s)
        fin = planos[i + 1]["t"] if i + 1 < len(planos) else cierre
        ps = [pieza(x, s - x["seg"]) + (x,) for x in planos[i]["textos"] if s >= x["seg"] and s < min(fin, cierre)]
        y = H * .56 - sum(p.height - 2 * m + 26 for p, m, _ in ps) / 2  # todo por encima de .8 H: el caption de Instagram tapa abajo
        for p, m, x in ps:
            im.alpha_composite(p, ((W - p.width) // 2, max(0, int(y) - m)))
            y += p.height - 2 * m + 26
        if s >= cierre:
            k = ez((s - cierre) / .25)
            im.alpha_composite(Image.new("RGBA", (W, H), (*fondo, int(245 * k))))
            con_logo(im, 800, int(H * .4), k)
            p, m = pieza({"t": f["cierre"]["url"], "tipo": "cta"}, s - cierre)
            im.alpha_composite(p, ((W - p.width) // 2, int(H * .4) + int(800 * logo.height / logo.width) + 60 - m))
        return im

    out = f"{d}/out"
    os.makedirs(out, exist_ok=True)
    partes = []
    for i, p in enumerate(planos):
        dur = (planos[i + 1]["t"] if i + 1 < len(planos) else total) - p["t"]
        src = f"{d}/clips/{p['id']}.mp4"
        largo = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src],
                                     capture_output=True, text=True).stdout)
        lento = min(1.5, dur / (largo - .1)) if dur > largo - .1 else 1.
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf",
                        f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setpts=PTS*{lento:.3f},fps={FPS},"
                        f"tpad=stop_mode=clone:stop_duration=8,trim=duration={dur:.3f},setsar=1",
                        "-an", "-c:v", "libx264", "-crf", "14", "-preset", "fast", f"{out}/{i:02d}.mp4"], check=True)
        partes.append(f"{out}/{i:02d}.mp4")
    open(f"{out}/lista.txt", "w").write("".join(f"file '{p}'\n" for p in partes))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{out}/lista.txt", "-c", "copy", f"{out}/base.mp4"], check=True)
    pr = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", f"{out}/texto.mov"], stdin=subprocess.PIPE)
    for i in range(int(total * FPS)):
        pr.stdin.write(cuadro(i / FPS).tobytes())
    pr.stdin.close()
    pr.wait()

    # mezcla: voz al frente, música que se aparta, un efecto por evento en pantalla
    t0 = f.get("voz_inicio", .5)
    ef = [(f"{SFX}/whoosh.wav", p["t"] - .4, -15) for p in planos[1:]]
    ef += [(f"{SFX}/pop.wav", x["seg"], -19) for p in planos for x in p["textos"] if x["tipo"] in ("b", "n")]
    ef += [(f"{SFX}/subdrop.wav", x["seg"] - .05, -10) for p in planos for x in p["textos"] if x["tipo"] == "n"]
    ef += [(f"{SFX}/subdrop.wav", cierre - .05, -9), (f"{SFX}/sting.wav", cierre, -11)]
    ins = ["-i", f"{d}/voz.mp3", "-i", f"{d}/{f['musica']}"]
    fil = [f"[0:a]aresample=48000,aformat=channel_layouts=stereo,adelay={int(t0 * 1000)}:all=1,highpass=f=90,"
           f"equalizer=f=3000:t=q:w=1.2:g=2,acompressor=threshold=0.1:ratio=3:attack=5:release=80:makeup=2,apad,atrim=0:{total:.3f},asplit=2[voz][sc]",
           f"[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total:.3f},afade=t=out:st={total - .6:.3f}:d=0.6,volume=-11dB,extrastereo=m=2[mus]",
           "[mus][sc]sidechaincompress=threshold=0.05:ratio=3:attack=20:release=250[musd]"]
    for j, (a, t, db) in enumerate(ef):
        ins += ["-i", a]
        fil.append(f"[{j + 2}:a]aresample=48000,aformat=channel_layouts=stereo,volume={db}dB,adelay={int(max(0, t) * 1000)}:all=1[e{j}]")
    fil.append("[voz][musd]" + "".join(f"[e{j}]" for j in range(len(ef))) + f"amix=inputs={len(ef) + 2}:normalize=0,atrim=0:{total:.3f}[mix]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(fil), "-map", "[mix]", "-ar", "48000", f"{out}/mezcla_cruda.wav"], check=True)
    # ganancia lineal a -14 LUFS con techo de pico: loudnorm de una pasada sube los silencios
    med = subprocess.run(["ffmpeg", "-hide_banner", "-i", f"{out}/mezcla_cruda.wav", "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", med)[-1])
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{out}/mezcla_cruda.wav", "-af",
                    f"volume={-14 - lufs:.2f}dB,alimiter=limit=0.8:level=disabled", f"{out}/mezcla.wav"], check=True)
    salida = f"{d}/{f['salida']}"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{out}/base.mp4", "-i", f"{out}/texto.mov", "-i", f"{out}/mezcla.wav",
                    "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]", "-map", "[v]", "-map", "2:a",
                    "-c:v", "libx264", "-crf", "17", "-preset", "slow", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart",
                    "-t", f"{total:.3f}", salida], check=True)
    # tiempo para leer: lo que se queda corto se avisa, no se esconde
    for i, p in enumerate(planos):
        fin = planos[i + 1]["t"] if i + 1 < len(planos) else cierre
        for x in p["textos"]:
            minimo = max(1.0, len(x["t"]) / 15)
            if fin - x["seg"] < minimo:
                print(f"AVISO: '{x['t']}' dura {fin - x['seg']:.1f} s en pantalla; pide {minimo:.1f} s")
    print(round(total, 2), "s", salida)


PASOS = {"cuadros": cuadros, "clips": clips, "voz": voz, "musica": musica, "armar": armar}

if __name__ == "__main__":
    ruta = os.path.abspath(sys.argv[1])
    ficha, carpeta = json.load(open(ruta)), os.path.dirname(ruta)
    for paso in sys.argv[2:] or list(PASOS):
        print("==", paso)
        PASOS[paso](ficha, carpeta)
