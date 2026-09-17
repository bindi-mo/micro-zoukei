# Create plug-ins for microStudio

You can create microStudio plug-ins, either for your own usage or for everyone. A plug-in is simply an app you create with microStudio, which
can access your project files to generate or transform content for your game. One common example is when you need to build your own level editor
for your specific game: you can make the editor a separate project, then the plug-in system will allow you to use your editor from your game project
directly. The plug-in will show up as a new project tab and will save generated data directly to your game project.

## Access to project files

In order to create a plug-in, you need to be familiar with the microStudio project access API first. This API lets you manage your project files programmatically: you can list existing files, load files, write new files or delete files. The required API functions are attached to `system.project`.

> Note that the project access API is only available when your project is running from within the microStudio app, or when your app is used as a plug-in.

### list files

`system.project.listFiles` can be used to get the list of files in a particular folder or subfolder of your project. There are 6
official root folders: `"source"`, `"sprites"`, `"maps"`, `"sounds"`, `"music"`, `"assets"`. The second argument to `listFiles` is
a callback function which will be called with the resulting list.

|||
|-|-|
|system.project.listFiles( "source", function( list, error) print(list) end )||
|system.project.listFiles( "sprites/folder1", function( list, error) print(list) end )||
|system.project.listFiles( "maps", function( list, error) print(list) end )||
|system.project.listFiles( "sounds", function( list, error) print(list) end )||
|system.project.listFiles( "music", function( list, error) print(list) end )||
|system.project.listFiles( "assets", function( list, error) print(list) end )||

### read files

You can read project files using `system.project.readFile`. Here again, a callback will be used
to receive the result. The resulting object depends on the folder and type of file you are reading:

* source code files will result in a `string`
* sprites will result in a `Sprite`
* maps will result in a `Map`
* sounds **and music** will result in a `Sound`
* image assets will result in an `Image`
* JSON assets will result in a microScript `object`
* Text file assets or OBJ files will result in a `string`

|||
|-|-|
|system.project.readFile( "source/main", function(result, error) print(result) end )||
|system.project.readFile( "sprites/icon", function( sprite, error) screen.drawSprite(sprite,0,0,50) end )||
|system.project.readFile( "maps/folder/map1", function( map, error) screen.drawMap(map,0,0,320,200) end )||
|system.project.readFile( "sounds/fx/blast", function(sound, error) sound.play() end )||
|system.project.readFile( "music/song", function(sound, error) sound.play() end )||
|system.project.readFile( "assets/textfile", function(text, error) print(text) end )||
|system.project.readFile( "assets/image_file", function( image, error) screen.drawImage(image,0,0,200) end )||
|system.project.readFile( "assets/json_file", function( obj, error) print(obj.x) end )||

### write files

You can write project files using `system.project.writeFile`. The object you write must match the root folder
you are putting it it:

* source folder accepts only `string`
* sprites folder accepts `Image` and `Sprite`
* maps folder accepts only `Map`
* sound and music folders accept only `Sound`
* assets folder accept `object` (saved as JSON), text (saved as TXT, CSV or OBJ files), images (can be saved as PNG or JPG files)

The third parameter is an object which holds options. You can set `ext` to use a specific extension for your file. If you are overwriting
an existing file, you need to set option "replace" to 1 (true).

|||
|-|-|
|system.project.writeFile( "source/generated/src1", string, 0, function(result, error) print(result) end )||
|system.project.writeFile( "sprites/generated/sprite1", sprite, 0, function(result, error) print(result) end )||
|system.project.writeFile( "sprites/generated/map1", map, 0, function(result, error) print(result) end )||
|system.project.writeFile( "sounds/generated/sound1", sound, 0, function(result, error) print(result) end )||
|system.project.writeFile( "music/generated/music1", sound, 0, function(result, error) print(result) end )||
|system.project.writeFile( "assets/generated/textfile", string, object ext = "txt" end, function(result, error) print(result) end )||
|system.project.writeFile( "assets/generated/jsonfile", obj, object replace = "true" ext = "json" end, function(result, error) print(result) end )||
|system.project.writeFile( "assets/generated/imagefile", image, object ext = "jpg" end, function(result, error) print(result) end )||

### delete files

You can delete files using `system.project.deleteFile`. See an example below:

|||
|-|-|
|system.project.deleteFile( "sprites/sprite1", function(result, error) print(result) end )||

## Create a plug-in

Once you have created an app which allows to create content and save it back to the project, you can easily turn it into a plug-in. Open the
Settings tab / Show advanced options. Under "Project Type", select "Plug-in".

> Note: when used as a plug-in, your app file access will be restricted by default to a subfolder of the host project.

## Use plug-ins

When you are working on your game project, click the `+` button under the common project tabs. You will see your own private plug-ins (if any)
displayed there, as well as public plug-ins from the community. Just click a plug-in to activate it.
