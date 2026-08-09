"""
Uretilen taslarin siluet kontrolu icin contact-sheet render alir.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/render_preview.py

Iki gorunum uretir:
    assets/preview_side.png  -- yandan, siluet okunabilirligi icin
    assets/preview_top.png   -- ustten acili, tahtadaki gercek bakis acisi
"""

import bpy
import os
import sys
import math

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import gen_pieces as gp  # noqa: E402

OUT = os.path.join(ROOT, "assets")


def build_row():
    gp.clear_scene()
    builders = [gp.make_pawn, gp.make_rook, gp.make_knight,
                gp.make_bishop, gp.make_queen, gp.make_king]
    objs = []
    for i, b in enumerate(builders):
        ob = b()
        ob.location = (i * 1.0 - 2.5, 0.0, 0.0)
        objs.append(ob)
    return objs


def add_ground():
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.001))
    return bpy.context.active_object


def setup_render(name, cam_loc, cam_rot, ortho_scale):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 600
    scene.render.film_transparent = False

    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "SINGLE"
    shading.single_color = (0.85, 0.85, 0.88)
    shading.show_shadows = True
    shading.show_cavity = True

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho_scale
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = cam_loc
    cam.rotation_euler = cam_rot
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print(f"[preview] {scene.render.filepath}.png")


def main():
    build_row()
    add_ground()
    # yandan tam profil -- siluet testi
    setup_render("preview_side", (0, -10, 0.55), (math.radians(90), 0, 0), 7.0)
    # oyuncunun tahtada gorecegi aci
    setup_render("preview_top", (0, -7, 5.0), (math.radians(55), 0, 0), 7.5)


if __name__ == "__main__":
    main()
