# Babylon.js
## 3D rendering API

Babylon.js is an open-source 3D rendering engine based on WebGL.

Website: https://www.babylonjs.com/

Github: https://github.com/BabylonJS/Babylon.js

## Basics

### Enable Babylon.js

After creating your project, open the settings tab, click "Show advanced settings" and choose Babylon.js as "Graphics library".

### Scene

Creating a new scene:

```
scene = new BABYLON.Scene()
```

### Adding objects

Adding a simple box:

```
box = BABYLON.MeshBuilder.CreateBox("box", object end, scene)
box.position.set(0,20,0)
```

### Adding lights

Adding an hemispherical light:

```
light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene)
```

### Setting the camera

Setting up the camera:

```
camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -100), scene)
```

### Rendering

In your function `draw()`, simply call `screen.render`, passing your scene as argument:

```
draw = function()
  screen.render(scene)
end
```

### Load a local asset from the microStudio "Assets" tab (make Assets tab visible in Settings)

```
loader = asset_manager.loadModel( "myfolder/mymodelfile", callback )
```

Initiates the loading of a 3D model. 
The result is a `container` object holding all the model data.

Loading is asynchronous, you have two ways to check when loading is complete:

Example using a callback function:

```
asset_manager.loadModel("somefolder/mymodelfile", function(container)
    container.addAllToScene()
    // or check Babylon.js documentation for other ways to handle the result
    // asset_manager.loadModel is mapped on BABYLON.SceneLoader.LoadAssetContainer
  end)
```

Example using the loader object:

```
loader = asset_manager.loadModel("somefolder/mymodelfile")

(...)

if loader.ready then
  loader.container.addAllToScene()
end
```

### Load a local asset stored on your device
Use a file server on your local device to serve the local asset file
(e.g. with npm's http-server package or python's http.server module)
Whichever local server you choose, you must specify "cors" in the 
http header you serve the file with as indicated below:

```
http-server -cors 
```
[npm's http-server]

Python's http.server doesn't include a "cors" option; 
You can Google different solutions to add cors functionality.
One solution:
https://gist.github.com/khalidx/6d6ebcd66b6775dae41477cffaa601e5

### Load an asset stored on another server (e.g. Babylon.js, Dropbox, etc.)
https://doc.babylonjs.com/toolsAndResources/thePlayground/externalPGAssets

### Enable Babylon.js Scene Inspector/Explorer
scene.debugLayer.show(object overlay= true end)

## Documentation

### Official documentation

https://doc.babylonjs.com/

### Useful introduction to Babylon:

https://dvic.devinci.fr/first-steps-with-babylon-js

### Examples

* https://microstudio.dev/i/JimB007/babylonstarter/
* https://microstudio.dev/i/gilles/babylontest/
* https://microstudio.dev/i/JimB007/babylonparticles/
