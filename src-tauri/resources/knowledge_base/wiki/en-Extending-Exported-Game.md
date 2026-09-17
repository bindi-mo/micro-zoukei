# Extending your exported game

## Export game

In order to export your game for Windows, Mac, Linux or Android, you can use the one-click builders provided.

Maybe you will need to add some extra features to your game, such as integrating an external SDK for the display of ads or for in app purchases.
Here is the way to go:

### Export to HTML5

Navigate to the "Publish" tab in microStudio and export your game to HTML5. The resulting archive can be used as is to publish the game
on a website. But you may also use it to build the game yourself to Windows / Mac / Linux (using Electron) or to iOS / Android (using Cordova).

Before building with such tools, you may integrate external SDKs to your code:

### Extend functionalities

* Unzip the exported archive
* Locate the file "index.html"
* In this file, you will find the following snippet:

```javascript
    window.addEventListener("load",function() {
      window.player = new Player(function(event) {
        if (event.name == "started") {
          // signal that the game is started
        }
        else if (event.name == "log") {
          // console.info(event.data) ;
        }
      }) ;
      document.body.focus() ;
    }) ;
```

This is where you can insert more functionality, leveraging the microScript / JavaScript interoperability.

1. As soon as you have received the signal that the game is "started" (see above), you can inject functions or objects into the global context of the microStudio engine:
```javascript
window.player.setGlobal("special_callback",function(x) { console.info(x) }) ;
```
> Your microScript code can now call the "special_callback" function

2. You can also call microScript global functions from your JavaScript code:
```javascript
window.player.call("call_me_from_javascript",[10,1000]) ;
```
> arguments to your microScript function call should be provided as an array


3. Run a microScript code snippet from your JavaScript code:
```javascript
window.player.exec("player.position_x = 50",function(result) { console.log(result) ; }) ;
```

## Build for

### Windows, Mac, Linux

microStudio provides builders for Windows, Mac and Linux that will produce your app in one click.
However, if you need to extend the functionality first, as seen above, then you will have to build by yourself.
It should be quite easy, starting with an HTML5 export and then following the steps in this tutorial:

https://www.electronjs.org/docs/latest/tutorial/quick-start

### iOS, Android

microStudio provides a builder for Android, which will produce an APK of your game in one click.
However, if you need to extend the functionality first, as seen above, or if you need to build and iOS version,
then you will have to build by yourself. It should be quite easy, starting with an HTML5 export and then following the steps in this tutorial:

https://cordova.apache.org/docs/en/latest/guide/cli/index.html
