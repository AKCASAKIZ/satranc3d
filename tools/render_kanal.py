"""
Kanal gorselleri: avatar (kare) ve banner (2048x1152).

    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/render_kanal.py

Neden ayri bir betik: render_preview.py `gen_pieces` ile PROSEDUREL taslari
uretiyor, yani ESKI ortacag setini. Kanal gorselinin urunle ayni gorunmesi
sart, o yuzden burada assets/glb'deki kung-fu GLB'leri ICE AKTARILIYOR.

Cikti:
    kanal/avatar.png   1024x1024  sah, yakin plan (hale + guandao siluet)
    kanal/banner.png   2048x1152  alti tas dizili

Avatar kucuk gorunecek (YouTube'da 32 px'e kadar iniyor), o yuzden:
  - tek figur, govde ustu kirpim
  - koyu duz zemin, yuksek kontrast
  - hale ustte kalsin diye kamera hafif yukaridan
"""

import bpy
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GLB = os.path.join(ROOT, "assets", "glb")
OUT = os.path.join(ROOT, "kanal")


def temizle():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def glb_al(ad):
    """GLB'yi ice aktarir, en ustteki bos olmayan nesneyi dondurur."""
    once = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(GLB, ad))
    yeni = [o for o in bpy.data.objects if o not in once]
    kok = [o for o in yeni if o.parent is None]
    return kok[0] if kok else yeni[0]


def poz_ver(kok, klip, kare):
    """Ice aktarilan armature'a bir klibin belirli karesini uygular.

    glTF klipleri Blender'a ayri action olarak geliyor; adiyla bulunup
    armature'a atanıyor. Bulunamazsa T-poz kalir (render yine calisir).
    """
    arm = None
    for o in ([kok] + list(kok.children_recursive)):
        if o.type == "ARMATURE":
            arm = o
            break
    if not arm:
        return
    act = next((a for a in bpy.data.actions if a.name.endswith(klip)), None)
    if not act:
        return
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = act
    bpy.context.scene.frame_set(kare)


def isik_kur(guc=1.0):
    # !! Guc olculu secildi. Ilk denemede 5400 W vardi: zemin gri patliyor,
    #    safran cubbe soluk pembeye donuyordu - avatar kucukken kontrast
    #    tamamen kayboluyor.
    g = bpy.data.lights.new("key", type="AREA")
    g.energy = 320 * guc
    g.size = 6
    ob = bpy.data.objects.new("key", g)
    ob.location = (4, -5, 6)
    ob.rotation_euler = (math.radians(50), 0, math.radians(38))
    bpy.context.collection.objects.link(ob)

    d = bpy.data.lights.new("fill", type="AREA")
    d.energy = 90 * guc
    d.size = 8
    ob2 = bpy.data.objects.new("fill", d)
    ob2.location = (-5, -4, 3)
    ob2.rotation_euler = (math.radians(70), 0, math.radians(-55))
    bpy.context.collection.objects.link(ob2)


def zemin(renk=(0.055, 0.062, 0.072, 1)):
    mat = bpy.data.materials.new("bg")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = renk
    bsdf.inputs["Roughness"].default_value = 0.9
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    bpy.context.object.data.materials.append(mat)
    # Arka duvar: figur zemine karismasin
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 9, 0),
                                     rotation=(math.radians(90), 0, 0))
    bpy.context.object.data.materials.append(mat)


def kamera(konum, hedef, lens=70):
    cam_d = bpy.data.cameras.new("cam")
    cam_d.lens = lens
    cam = bpy.data.objects.new("cam", cam_d)
    cam.location = konum
    bpy.context.collection.objects.link(cam)
    bos = bpy.data.objects.new("hedef", None)
    bos.location = hedef
    bpy.context.collection.objects.link(bos)
    c = cam.constraints.new("TRACK_TO")
    c.target = bos
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"
    bpy.context.scene.camera = cam
    return cam


def render(yol, w, h, ornek=64):
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.samples = ornek
    s.cycles.use_denoising = True
    s.render.resolution_x = w
    s.render.resolution_y = h
    s.render.resolution_percentage = 100
    s.render.film_transparent = False
    s.render.filepath = yol
    s.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("yazildi:", yol)


def avatar():
    temizle()
    zemin()
    isik_kur()
    kok = glb_al("chess_king_white.glb")
    # Zafer duruşu: hale ve guandao en okunakli oldugu kare.
    poz_ver(kok, "Victory", 30)
    # !! YouTube avatari DAIRE olarak kirpiyor: koseler gidiyor, kenara
    #    dayanan her sey kesiliyor. Bas kare merkezinde ve cevresinde pay
    #    birakilarak yerlestiriliyor.
    kamera((0.42, -1.62, 1.34), (0.0, 0.0, 1.10), lens=78)
    render(os.path.join(OUT, "avatar.png"), 1024, 1024)


def banner():
    temizle()
    zemin()
    isik_kur(guc=1.15)
    sira = ["pawn", "rook", "knight", "bishop", "queen", "king"]
    for i, ad in enumerate(sira):
        kok = glb_al(f"chess_{ad}_white.glb")
        kok.location = (i * 1.15 - 2.9, 0.0, 0.0)
        poz_ver(kok, "Stance_Ready", 20)
    # !! YOUTUBE GUVENLI ALANI: 2048x1152'nin her cihazda gorunen kismi
    #    ortadaki 1235x338'lik SERIT. Ilk denemede kamera cok yakindi:
    #    alti tasin ikisi kadraj disinda kaldi ve figurler seridin ALTINA
    #    dustu, yani telefonda govdeleri kesiliyordu.
    #    Hesap: 6 figur x 1.15 aralik ~= 6.5 birim genislik; bunun 1235 px'e
    #    sigmasi icin tam kare 6.5 * 2048/1235 ~= 10.8 birim gormeli.
    #    62 mm lenste yatay gorus acisi ~32.3 derece -> mesafe ~18.6 birim.
    #    Dikeyde serit 1.78 birime denk geliyor, figur 1.4 - siğiyor.
    kamera((0, -18.6, 1.55), (0, 0, 0.72), lens=62)
    render(os.path.join(OUT, "banner.png"), 2048, 1152)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    hangi = sys.argv[-1] if len(sys.argv) else ""
    if hangi == "avatar":
        avatar()
    elif hangi == "banner":
        banner()
    else:
        avatar()
        banner()
