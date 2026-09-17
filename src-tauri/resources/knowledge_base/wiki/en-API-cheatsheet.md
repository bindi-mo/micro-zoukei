# API cheatsheet

## Drawing

### screen

|||
|-|-|
|screen.width|The current width of the screen in microStudio units|
|screen.height|The current height of the screen in microStudio units|
|screen.clear( [color] )|Clears the screen (fills it in black, or in the optional color argument passed)|
|screen.setColor( color )|Sets the color for subsequent drawing operations.|
|screen.setAlpha( opacity )|Sets the opacity of subsequent drawing operations, in the range [0 .. 1]|
|screen.setBlending( blending )|Sets the blending mode for subsequent drawing operations|
|screen.setLinearGradient( x1, y1, x2, y2, color1, color2 )|Sets a linear gradient for subsequent drawing operations|
|screen.setRadialGradient( x, y, radius, color1, color2 )|Sets a radial gradient for subsequent drawing operations|
|screen.setFont( font_name )|Sets the name of the font to use for subsequent text drawing operations|
|screen.setTranslation( tx, ty )|Translates the screen coordinates|
|screen.setScale( sx, sy )|Scales the screen coordinates|
|screen.setRotation( rotation )|Rotates the screen coordinates|
|screen.setDrawAnchor( x, y )|Sets the anchor (pivot) point for drawing elements. Range for x and y: [-1 .. 1]|
|screen.setDrawRotation( rotation )|Sets a rotation angle for drawing elements, around their anchor point|
|screen.setDrawScale( x, y )|Sets the drawing scale for elements, on their x-axis and y-axis|
|screen.fillRect( x, y, width, height [,color] )|Draws a filled rectangle|
|screen.fillRoundRect( x, y, width, height, roundness [,color] )|Draws a filled rounded rectangle|
|screen.fillRound( x, y, width, height [,color] )|Draws a filled round shape (ellipse or circle depending on your arguments)|
|screen.drawRect( x, y, width, height [,color] )|Draws a rectangle outline|
|screen.drawRoundRect( x, y, width, height, roundness [,color] )|Draws a rounded rectangle outline|
|screen.drawRound( x, y, width, height [,color] )|Draws a round shape outline (ellipse or circle depending on your arguments)|
|screen.drawSprite( name, x, y, width [,height] )|Draws a sprite at given coordinates|
|screen.drawSpritePart( name, px, py, pw, ph, x, y, width [,height] )|Draws an area of this sprite at given coordinates|
|screen.drawImage( image, x, y, width [,height] )|Draws an image at given coordinates|
|screen.drawImagePart( image, px, py, pw, ph, x, y, width [,height] )|Draws an area of the image at given coordinates|
|screen.drawMap( name, x, y, width [,height] )|Draws a map at given coordinates|
|screen.setPixelated( pixelated )|Sets how sprites or images must be rendered: pixelated or smoothed|
|screen.drawText( text, x, y, size [,color] )|Draws text at given coordinates with given size|
|screen.drawTextOutline( text, x, y, size [,color] )|Draws text outline at given coordinates with given size|
|screen.textWidth( text, size )|Returns the width of the given text when drawn at given size|
|screen.setLineWidth( width )|Sets the width of lines for subsequent drawing operations|
|screen.setLineDash( [2,4] )|Sets the line style, as an array of lines and gaps|
|screen.drawLine( x1, y1, x2, y2 )|Draws a line|
|screen.drawPolygon( x1, y1, x2, y2, x3, y3 ... [,color])|The coordinates can also be passed as an array|
|screen.drawPolyline( x1, y1, x2, y2, x3, y3 ... [,color])|The coordinates can also be passed as an array|
|screen.fillPolygon( x1, y1, x2, y2, x3, y3 ... [,color])|The coordinates can also be passed as an array|
|screen.drawArc( x, y, radius, start_angle, end_angle, counter_clockwise [,color])|Draws an arc of a circle|
|screen.fillArc( x, y, radius, start_angle, end_angle, counter_clockwise [,color])|Fills an arc of a circle|
|screen.drawQuadCurve( x1, y1, cp1x, cp1y, x2, y2, ... [,color])|You can pass as many points as needed ; you can pass all the points as an array|
|screen.drawBezierCurve( x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2, ... [,color])|You can pass as many points as needed ; you can pass all the points as an array|
|screen.setCursorVisible( visible )|Sets whether the mouse cursor should be visible|
|screen.loadFont( fontname )|Initiates the loading of a font|
|screen.isFontReady( fontname )|Checks whether the font is ready to use|

### colors

|||
|-|-|
|"rgb(128,160,196)"||
|"rgba(128,160,196,0.5)"||
|"#8090A0"||
|"hsl(200,50%,50%)"||
|"hsla(200,50%,50%,0.25)"||

### blending modes

||||||
|-|-|-|-|-|
|"normal"|"additive"|"source-out"|"source-atop"|"destination-over"|
|"destination-in"|"destination-out"|"destination-atop"|"lighter"|"copy"|
|"xor"|"multiply"|"screen"|"overlay"|"darken"|
|"lighten"|"color-dodge"|"color-burn"|"hard-light"|"soft-light"|
|"difference"|"exclusion"|"hue"|"saturation"|"color"|
|"luminosity"|"source-over"|"source-in"|

See https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation

## Inputs / Control

### keyboard

|||||
|-|-|-|-|
|keyboard.A|keyboard.B|keyboard.UP|keyboard.SPACE|
|keyboard.press.A|keyboard.press.B|keyboard.press.UP|keyboard.press.SPACE|
|keyboard.release.A|keyboard.release.B|keyboard.release.UP|keyboard.release.SPACE|

### gamepad

||||
|-|-|-|
|gamepad.A|gamepad.B|gamepad.X|
|gamepad.Y|gamepad.LB|gamepad.RB|
|gamepad.VIEW|gamepad.MENU|gamepad.LS|
|gamepad.RS|gamepad.DPAD_UP|gamepad.DPAD_DOWN|
|gamepad.DPAD_LEFT|gamepad.DPAD_RIGHT|gamepad.LT|
|gamepad.RT|gamepad.UP|gamepad.DOWN|
|gamepad.LEFT|gamepad.RIGHT|gamepad.LEFT_STICK_UP|
|gamepad.LEFT_STICK_DOWN|gamepad.LEFT_STICK_LEFT|gamepad.LEFT_STICK_RIGHT|
|gamepad.RIGHT_STICK_UP|gamepad.RIGHT_STICK_DOWN|gamepad.RIGHT_STICK_LEFT|
|gamepad.RIGHT_STICK_RIGHT|gamepad.LEFT_STICK_ANGLE|gamepad.LEFT_STICK_AMOUNT|
|gamepad.RIGHT_STICK_ANGLE|gamepad.RIGHT_STICK_AMOUNT|

|||
|-|-|
|gamepad.press.A (B, X, Y ...)|gamepad.release.A (B, X, Y ...)|
|gamepad[0].A (B, X, Y ...)|gamepad[1].A (B, X, Y ...)|
|gamepad[2].press.A (B, X, Y ...)|gamepad[3].release.A (B, X, Y ...)|

### touch

|||
|-|-|
|touch.touching||
|touch.press||
|touch.release||
|touch.x||
|touch.y||
|touch.touches|list of all current active touches|

### mouse

|||
|-|-|
|mouse.x|current mouse pointer position x|
|mouse.y|current mouse pointer position y|
|mouse.pressed|1 if any mouse button is pressed, else 0|
|mouse.left|1 if left mouse button is pressed, else 0|
|mouse.middle|1 if middle mouse button is pressed, else 0|
|mouse.right|1 if right mouse button is pressed, else 0|
|mouse.wheel|value can be 1 (up), -1 (down) or 0|
|mouse.press|1 if any mouse button was just first pressed|
|mouse.release|1 when the last active mouse button was just released|


## Assets

### asset_manager

|||
|-|-|
|asset_manager.loadFont( path )|Initiates loading of the font asset|
|asset_manager.loadImage( path, callback )|Loads image, returns a loader object and calls callback when ready|
|asset_manager.loadModel( path, scene, callback )|Loads 3D model, returns a loader object and calls callback when ready|
|asset_manager.loadJSON( path, callback )|Loads JSON as microScript object, returns a loader object and calls callback when ready|
|asset_manager.loadText( path, callback )|Loads TXT as microScript string, returns a loader object and calls callback when ready|
|asset_manager.loadCSV( path, callback )|Loads CSV as microScript string, returns a loader object and calls callback when ready|
|asset_manager.loadMarkdown( path, callback )|Loads .md file as microScript string, returns a loader object and calls callback when ready|
|asset_manager.wasmInstance( path, callback )|Creates an instance of a WebAssembly module, returns a loader object and calls callback when ready|

## Misc

### system

|member|description|
|-|-|
|system.time()|Returns the system time in milliseconds (time elapsed since January 1st 1970)|
|system.language|Returns the language of the user|
|system.inputs|Allows to check which input methods are available on the user's system|
|system.inputs.keyboard|Returns 1 if the user's system has a keyboard|
|system.inputs.mouse|Returns 1 if the user's system has a mouse pointer|
|system.inputs.touch|Returns 1 if the user's system has a touch screen|
|system.inputs.gamepad|Returns 1 if there is at least one plugged in, active gamepad|
|system.prompt( text, callback)|Prompts the user to enter text and calls `callback( ok, text )`|
|system.say( text )|Displays a message to the user, in a dialog box|
|system.pause()|Pauses execution. Execution can be resumed with the "play" button in the microStudio interface|
|system.exit()|Exits the program|
|system.preemptive|Set to 1 by default, can be set to 0 to make the threading system non-preemptive|
|system.threads|Holds a list of all the active threads (running or paused).|
|system.update_rate|Writable call rate of `update()`, example: `system.update_rate = 120`|
|system.disable_autofullscreen|Set it to 1 to prevent your app from going fullscreen automatically on touch screens|

### storage

|||
|-|-|
|storage.set( name, value )||
|storage.get( name, value )||

## Images

### Create Image

|||
|-|-|
|`image = new Image( width, height )`||

### Draw on image

> Note: the default coordinates system for drawing into an image differs a lot from drawing on screen. When drawing on an image, the default unit is one pixel ; the origin is set to the upper left corner of the image. The y-axis is oriented downwards.
>
> If you wish to create an image preconfigured with the centered, y-axis up coordinate system, you can do so by adding `true` as third parameter to the Image constructor:
> ```
> image = new Image( width, height , true )
> ```

|member|description|
|-|-|
|image.width|Width of the image in pixels|
|image.height|Height of the image in pixels|
|image.clear( [color] )|Clears the image|
|image.setRGB( x, y, r, g, b)|Sets pixel color|
|image.setRGBA( x, y, r, g, b, a)|Sets pixel color and opacity|
|image.getRGB( x, y [,result])|Returns pixel color as an object with R, G and B components|
|image.getRGBA( x, y [,result])|Returns pixel color as an object with R, G, B and A components|
|image.setColor( color )|Sets the color for subsequent drawing operations.|
|image.setAlpha( opacity )|Sets the opacity of subsequent drawing operations, in the range [0 .. 1]|
|image.setBlending( blending )|Sets the blending mode for subsequent drawing operations|
|image.setLinearGradient( x1, y1, x2, y2, color1, color2 )|Sets a linear gradient for subsequent drawing operations|
|image.setRadialGradient( x, y, radius, color1, color2 )|Sets a radial gradient for subsequent drawing operations|
|image.setFont( font_name )|Sets the name of the font to use for subsequent text drawing operations|
|image.setTranslation( tx, ty )|Translates the image coordinates|
|image.setScale( sx, sy )|Scales the image coordinates|
|image.setRotation( rotation )|Rotates the image coordinates|
|image.setDrawAnchor( x, y )|Sets the anchor (pivot) point for drawing elements. Range for x and y: [-1 .. 1]|
|image.setDrawRotation( rotation )|Sets a rotation angle for drawing elements, around their anchor point|
|image.setDrawScale( x, y )|Sets the drawing scale for elements, on their x-axis and y-axis|
|image.fillRect( x, y, width, height [,color] )|Draws a filled rectangle|
|image.fillRoundRect( x, y, width, height, roundness [,color] )|Draws a filled rounded rectangle|
|image.fillRound( x, y, width, height [,color] )|Draws a filled round shape (ellipse or circle depending on your arguments)|
|image.drawRect( x, y, width, height [,color] )|Draws a rectangle outline|
|image.drawRoundRect( x, y, width, height, roundness [,color] )|Draws a rounded rectangle outline|
|image.drawRound( x, y, width, height [,color] )|Draws a round shape outline (ellipse or circle depending on your arguments)|
|image.drawSprite( name, x, y, width [,height] )|Draws a sprite at given coordinates|
|image.drawSpritePart( name, px, py, pw, ph, x, y, width [,height] )|Draws an area of this sprite at given coordinates|
|image.drawImage( image, x, y, width [,height] )|Draws an image at given coordinates|
|image.drawImagePart( image, px, py, pw, ph, x, y, width [,height] )|Draws an area of the image at given coordinates|
|image.drawMap( name, x, y, width [,height] )|Draws a map at given coordinates|
|image.setPixelated( pixelated )|Sets how sprites or images must be rendered: pixelated or smoothed|
|image.drawText( text, x, y, size [,color] )|Draws text at given coordinates with given size|
|image.drawTextOutline( text, x, y, size [,color] )|Draws text outline at given coordinates with given size|
|image.textWidth( text, size )|Returns the width of the given text when drawn at given size|
|image.setLineWidth( width )|Sets the width of lines for subsequent drawing operations|
|image.setLineDash( [2,4] )|Sets the line style, as an array of lines and gaps|
|image.drawLine( x1, y1, x2, y2 )|Draws a line|
|image.drawPolygon( x1, y1, x2, y2, x3, y3 ... [,color])|The coordinates can also be passed as an array|
|image.drawPolyline( x1, y1, x2, y2, x3, y3 ... [,color])|The coordinates can also be passed as an array|
|image.fillPolygon( x1, y1, x2, y2, x3, y3 ... [,color])|The coordinates can also be passed as an array|
|image.drawArc( x, y, radius, start_angle, end_angle, counter_clockwise [,color])|Draws an arc of a circle|
|image.fillArc( x, y, radius, start_angle, end_angle, counter_clockwise [,color])|Fills an arc of a circle|
|image.drawQuadCurve( x1, y1, cp1x, cp1y, x2, y2, ... [,color])|You can pass as many points as needed ; you can pass all the points as an array|
|image.drawBezierCurve( x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2, ... [,color])|You can pass as many points as needed ; you can pass all the points as an array|

### Save image

|||
|-|-|
|system.file.save( image, name [,format [, quality ]])|Saves the image to the PC. Format can be set to "png" or "jpg" and quality (jpg only) in the range [0 .. 1]|


## Sprites

### Create and modify

|||
|-|-|
|sprite = sprites["icon"]|Default global object `sprites` retains all project sprites|
|sprite.fps = 10|Change the animation speed in case of an animated sprite|
|sprite.setFPS( 10 )|Change the animation speed while preserving the current phase|
|sprite.setFrame(0)|Sets the current animation frame|
|image = sprite.frames[0]|Get the `Image` object of the first (or only) sprite frame|
|sprite.frames.push( image )|Add a new frame to this sprite|


## Maps

### Create Map

|||
|-|-|
|map = new Map( width_in_tiles, height_in_tiles, tile_pixel_width, tile_pixel_height )||

### Map functions

|||
|-|-|
|map.get( x, y )||
|map.set( x, y , "sprite" )||
|map.set( x, y , "tilemap:4,6" )||


## Sounds

### beeps

|||
|-|-|
|audio.beep( "C4 E G C5 E G" )||
|audio.beep( "volume 50 span 50 tempo 240 loop 4 C4 E G C5 E G end" )||
|audio.cancelBeeps()||

### play sounds

|||
|-|-|
|sound = audio.playSound( "mysound" )|Starts playing the sound "mysound" and returns a controller object|

#### control sound playback

|||
|-|-|
|sound.setVolume( volume )|sets the volume for the playback of the sound|
|sound.setPitch( pitch )|sets the pitch for the playback of the sound|
|sound.setPan( pan )|sets the pan of the playing sound|
|sound.getDuration()|returns the duration of the sound in seconds|
|sound.stop()|stops the playback of the sound|

### play music

|||
|-|-|
|music = audio.playMusic( "mymusic" )|Starts playing the music "mymusic" and returns a controller object|

#### control music playback

|||
|-|-|
|music.setVolume( volume )||
|music.stop()||
|music.play()||
|music.getDuration()|in seconds|
|music.getPosition()|in seconds|
|music.setPosition( position )|in seconds|


### create Sound

|||
|-|-|
|sound = new Sound( channels, length, sampleRate )|Creates a sound object|
|sound.write( channel, index, value )|Writes sample data|
|sound.read( channel, index )|Reads sample data|
|sound.play( [ volume, pitch, pan, loop ])||


## File API

### load file


#### with callback

```
system.file.load( ["png","jpg"] , function( file_list )
    for file in file_list
      print(file.content)
    end
  end)
```

#### without callback

```
system.file.load( ["png","jpg"] )

(...)

update = function()
  if system.file.loaded then
    for file in system.file.loaded
      print( file.content )
    end
  end
end
```

### file dropped

```
update = function()
  if system.file.dropped then
    for file in system.file.dropped
      print( file.content )
    end
  end
end
```

### save file

|||
|-|-|
|system.file.save( obj, name )|saves your object as a json file|
|system.file.save( image, name )||
|system.file.save( sound, name )||


## Project access API

The project access API is only available when the project is running within the microStudio editor.
You can check the availability with `if system.project then ...`

### list project files

|||
|-|-|
|system.project.listFiles( "source", function( list, error) print(list) end )||
|system.project.listFiles( "sprites/folder1", function( list, error) print(list) end )||
|system.project.listFiles( "maps", function( list, error) print(list) end )||
|system.project.listFiles( "sounds", function( list, error) print(list) end )||
|system.project.listFiles( "music", function( list, error) print(list) end )||
|system.project.listFiles( "assets", function( list, error) print(list) end )||

### read project files

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

### write project files

|||
|-|-|
|system.project.writeFile( "source/generated/src1", string, 0, function(result, error) print(result) end )||
|system.project.writeFile( "sprites/generated/sprite1", sprite, 0, function(result, error) print(result) end )||
|system.project.writeFile( "sprites/generated/map1", map, 0, function(result, error) print(result) end )||
|system.project.writeFile( "sounds/generated/sound1", sound, 0, function(result, error) print(result) end )||
|system.project.writeFile( "music/generated/music1", sound, 0, function(result, error) print(result) end )||
|system.project.writeFile( "assets/generated/textfile", string, object ext = "txt" end, function(result, error) print(result) end )||
|system.project.writeFile( "assets/generated/jsonfile", obj, object ext = "json" end, function(result, error) print(result) end )||
|system.project.writeFile( "assets/generated/imagefile", image, object ext = "jpg" end, function(result, error) print(result) end )||

### delete project file

|||
|-|-|
|system.project.deleteFile( "sprites/sprite1", function(result, error) print(result) end )||
