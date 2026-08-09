"""
Lowpoly Staunton satranc takimi ureticisi.

Calistirma:
    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/gen_pieces.py

Mantik: gercek Staunton taslari tornada uretilir -- bir kesit profili eksen
etrafinda dondurulur. Burada da ayni sey yapiliyor (bmesh spin), sadece
segment sayisi dusuk tutuluyor ki lowpoly tarz bedavaya gelsin.
Kare genisligi = 1.0 birim. Taslar +Z yukari, tabani z=0'da.
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

SEG = 12          # spin segmenti -- lowpoly hissin ana ayari
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")


# --------------------------------------------------------------------------
# yardimcilar
# --------------------------------------------------------------------------

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def new_obj(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def lathe(name, profile, segments=SEG):
    """profile: eksenden olculen (yaricap, yukseklik) noktalari.
    Ilk ve son nokta yaricap 0 olmali ki kati bir govde ciksin."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, 0.0, z)) for x, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(
        bm,
        geom=verts + edges,
        cent=(0, 0, 0),
        axis=(0, 0, 1),
        dvec=(0, 0, 0),
        angle=2 * math.pi,
        steps=segments,
        use_merge=False,
    )
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm)


def cutter_box(name, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    return ob


def boolean_cut(target, cutters):
    for c in cutters:
        m = target.modifiers.new(name="cut", type="BOOLEAN")
        m.operation = "DIFFERENCE"
        m.object = c
        m.solver = "FLOAT"
    bpy.context.view_layer.objects.active = target
    for m in list(target.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)


def join(main, others):
    bpy.ops.object.select_all(action="DESELECT")
    for o in others:
        o.select_set(True)
    main.select_set(True)
    bpy.context.view_layer.objects.active = main
    bpy.ops.object.join()
    return main


def finalize(obj):
    """Lowpoly gorunum: flat shading + temiz normaller. Renk Three.js'te verilir."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_flat()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.location = (0, 0, 0)


# --------------------------------------------------------------------------
# ortak taban profili -- her tasin altinda ayni disk + boyun baslangici
# --------------------------------------------------------------------------

def base_profile(r_base=0.36, r_neck=0.15, h_base=0.10):
    return [
        (0.00, 0.00),
        (r_base, 0.00),
        (r_base, h_base * 0.55),
        (r_base * 0.82, h_base),
        (r_neck * 1.35, h_base + 0.06),
        (r_neck, h_base + 0.14),
    ]


# --------------------------------------------------------------------------
# taslar
# --------------------------------------------------------------------------

def make_pawn():
    p = base_profile(0.28, 0.11, 0.09)
    p += [
        (0.13, 0.30),
        (0.20, 0.34),   # yaka
        (0.11, 0.38),
        (0.17, 0.44),   # kafa alti
        (0.17, 0.52),
        (0.09, 0.57),
        (0.00, 0.59),
    ]
    return finalize_ret(lathe("pawn", p))


def make_rook():
    p = base_profile(0.33, 0.15, 0.10)
    p += [
        (0.20, 0.40),
        (0.19, 0.52),
        (0.27, 0.56),   # ust bilezik
        (0.27, 0.70),
        (0.00, 0.70),
    ]
    ob = lathe("rook", p)
    # mazgallar: ust rimden 4 kertik
    cutters = []
    for i in range(4):
        a = math.pi / 2 * i + math.pi / 4
        cutters.append(cutter_box(
            f"rc{i}", (0.30, 0.13, 0.14),
            (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.665),
            (0, 0, a),
        ))
    boolean_cut(ob, cutters)
    return finalize_ret(ob)


def make_bishop():
    p = base_profile(0.31, 0.13, 0.10)
    p += [
        (0.17, 0.36),
        (0.15, 0.52),
        (0.23, 0.56),   # yaka
        (0.13, 0.61),
        (0.18, 0.70),   # baslik govdesi
        (0.15, 0.82),
        (0.07, 0.88),
        (0.05, 0.92),
        (0.07, 0.95),   # tepe topu
        (0.00, 0.99),
    ]
    ob = lathe("bishop", p)
    # klasik egik yarik
    cut = cutter_box("bcut", (0.06, 0.50, 0.26), (0.0, 0.0, 0.80), (0, math.radians(28), 0))
    boolean_cut(ob, [cut])
    return finalize_ret(ob)


def make_queen():
    p = base_profile(0.35, 0.15, 0.11)
    p += [
        (0.19, 0.40),
        (0.16, 0.62),
        (0.26, 0.68),   # yaka
        (0.15, 0.73),
        (0.30, 0.90),   # tac canagi
        (0.30, 0.97),
        (0.24, 0.97),
        (0.24, 0.90),
        (0.11, 0.86),
        (0.10, 1.00),
        (0.00, 1.04),   # tepe topu
    ]
    ob = lathe("queen", p)
    # tac kertikleri
    cutters = []
    for i in range(7):
        a = 2 * math.pi / 7 * i
        cutters.append(cutter_box(
            f"qc{i}", (0.16, 0.09, 0.13),
            (math.cos(a) * 0.31, math.sin(a) * 0.31, 0.955),
            (0, 0, a),
        ))
    boolean_cut(ob, cutters)
    return finalize_ret(ob)


def make_king():
    p = base_profile(0.36, 0.16, 0.11)
    p += [
        (0.20, 0.42),
        (0.17, 0.66),
        (0.27, 0.72),   # yaka
        (0.16, 0.77),
        (0.29, 0.94),   # tac
        (0.29, 1.02),
        (0.10, 1.06),
        (0.00, 1.08),
    ]
    ob = lathe("king", p)
    cutters = []
    for i in range(6):
        a = 2 * math.pi / 6 * i
        cutters.append(cutter_box(
            f"kc{i}", (0.15, 0.09, 0.12),
            (math.cos(a) * 0.30, math.sin(a) * 0.30, 1.005),
            (0, 0, a),
        ))
    boolean_cut(ob, cutters)
    # tepe hac
    v = cutter_box("kcv", (0.075, 0.075, 0.26), (0, 0, 1.20))
    h = cutter_box("kch", (0.20, 0.075, 0.075), (0, 0, 1.24))
    ob = join(ob, [v, h])
    ob.name = "king"
    return finalize_ret(ob)


def make_knight():
    """At tornalanamaz -- 2D siluet olusturup Y ekseninde kalinlik veriyoruz.
    Lowpoly'de en okunakli yaklasim bu."""
    p = base_profile(0.33, 0.15, 0.10)
    p += [(0.20, 0.34), (0.19, 0.40), (0.00, 0.40)]
    base = lathe("knight_base", p)

    # yandan gorunum siluet (x = ileri/burun yonu, z = yukari).
    # Nokta sirasi govdeyi cevreliyor: taban -> gogus -> burun -> alin ->
    # kulaklar -> ense -> yele -> taban. Yukseklik kale (0.70) ile
    # fil (0.99) arasinda kalmali, yoksa hiyerarsi bozuluyor.
    # Oran kurali: kutle KAFA ve BOYUNDA olmali, kulaklar kucuk kalmali.
    # Kulaklari buyutmek silueti tac/kedi gibi gosteriyor.
    # Oran kurali: kutle KAFA ve BOYUNDA, kulaklar kucuk. Burun UST-ONDE
    # durur ve altinda derin bogaz centigi olur -- Staunton atinin imzasi bu.
    sil = [
        (0.10, 0.36),    # taban on
        (0.13, 0.50),    # boyun on
        (0.15, 0.61),
        (0.27, 0.66),    # cene alti ileri cikinti (bogaz centiginin alt dudagi)
        (0.30, 0.75),    # burun alt on
        (0.29, 0.83),    # burun ust on
        (0.19, 0.84),    # burun sirti
        (0.13, 0.87),    # alin
        (0.06, 0.85),
        (0.05, 0.92),    # kulak 1
        (0.00, 0.85),    # kulak arasi centik
        (-0.05, 0.91),   # kulak 2
        (-0.10, 0.84),   # ense
        (-0.14, 0.72),   # yele ust
        (-0.18, 0.58),   # yele arka
        (-0.20, 0.46),
        (-0.17, 0.36),   # taban arka
    ]
    bm = bmesh.new()
    verts = [bm.verts.new((x, 0.0, z)) for x, z in sil]
    face = bm.faces.new(verts)
    # icbukey ngon -- glTF'e temiz gitmesi icin ucgenle
    bmesh.ops.triangulate(bm, faces=[face])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    head = new_obj("knight_head", bm)

    sol = head.modifiers.new(name="thick", type="SOLIDIFY")
    sol.thickness = 0.26
    sol.offset = 0.0
    bpy.context.view_layer.objects.active = head
    bpy.ops.object.modifier_apply(modifier=sol.name)

    ob = join(base, [head])
    ob.name = "knight"
    return finalize_ret(ob)


def finalize_ret(obj):
    finalize(obj)
    return obj


# --------------------------------------------------------------------------

def main():
    clear_scene()
    os.makedirs(OUT, exist_ok=True)

    builders = [make_pawn, make_rook, make_knight, make_bishop, make_queen, make_king]
    made = []
    for b in builders:
        ob = b()
        made.append(ob)
        print(f"[gen] {ob.name:8s} tri={len(ob.data.polygons):4d} verts={len(ob.data.vertices):4d}")

    path = os.path.join(OUT, "pieces.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
    )
    print(f"[gen] yazildi -> {path}  ({os.path.getsize(path)/1024:.1f} KB)")


if __name__ == "__main__":
    main()
