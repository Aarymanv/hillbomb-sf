import bpy, sys, time
print('Blender', bpy.app.version_string)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 16
sc.render.resolution_x = 256; sc.render.resolution_y = 256
bpy.ops.mesh.primitive_monkey_add(location=(0, 0, 0))
bpy.ops.object.shade_smooth()
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); cam.location = (0, -4, 1); cam.rotation_euler = (1.35, 0, 0); sc.camera = cam
light = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(light); light.rotation_euler = (0.6, 0.2, 0.4)
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.render.filepath = sys.argv[-1]
t = time.time(); bpy.ops.render.render(write_still=True); print('render s', round(time.time() - t, 1))
