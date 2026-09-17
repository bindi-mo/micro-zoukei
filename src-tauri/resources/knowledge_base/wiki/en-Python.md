# Python

## Setting up

You can choose to use the Python programming language for any of your projects. Open your project settings tab, click "Show advanced options" and select Python as Programming Language.

Your Python microStudio project can be exported to any target (HTML5, Windows, Mac, Linux, Android...). You can also use any of the rendering APIs for 2D or 3D, as well as any of the proposed optional libs.

Python support in microStudio relies on [Brython](https://brython.info/).

## Tips

### Checking user inputs

User inputs can be scanned in microStudio by checking fields in `keyboard`, `touch`, `mouse` or `gamepad` interfaces. For example, to check if the key `A` is pressed, you can check `keyboard.A`. This field can actually have 3 different statuses:
* if you haven't pressed `A` yet in the current session, `keyboard.A` is *undefined*
* `keyboard.A` is equal to `1` (`true` in microScript) if you are currently pressing it
* `keyboard.A` is equal to `0` (`false` in microScript) if have pressed it before and are not currently pressing it

To check for such fields in Python without errors, you need to check whether the field is actually defined before you can check its value:

```python
  if hasattr(keyboard,"A"):
    if keyboard.A:
      doSomething()
```

Here is a helper function that you may find useful:

```python
def checkInput(obj,val):
  if hasattr(obj,val):
    return obj[val] != 0
  return 0
```

### Instanciating classes

Especially when using alternative graphics libs or optional libs, you may have to
instantiate JavaScript objects as if you were using the `new` operator in JavaScript.
To do this, simply call `.new` on the class you want to instantiate:

```python
  light = BABYLON.HemisphericLight.new("light", BABYLON.Vector3.new(0, 1, 0), scene)
```

### Sleep function

As microStudio relies on [Brython](https://brython.info/), `time.sleep()` function is not available because blocking function are not supported in browser. An alternative is to use asynchronous programming with `aio.sleep()` function from `browser` package. 

Here is a simple working example : 

```python
from browser import aio

async def my_function():
  # do something
  await aio.sleep(1)  # pause 1 second
  # do something

aio.run(my_function())
```

## Simple Example

```python
def init():
  global x,y
  x = 0
  y = 0

def checkInput(obj,val):
  if hasattr(obj,val):
    return obj[val] != 0
  return 0

def update():
  global x,y
  if checkInput(keyboard,"LEFT"):
    x = x-1
  if checkInput(keyboard,"RIGHT"):
    x = x+1
  if checkInput(keyboard,"UP"):
    y = y+1
  if checkInput(keyboard,"DOWN"):
    y = y-1
  pass

def draw():
  global x,y
  screen.clear()
  screen.drawSprite("icon",x,y,30)
  pass
```
## Networking simple example

In order to create multiplayer games, you need to enable networking features in your project settings. 

Two files need to be created in your project : `server` and `client`. 

Here is a minimal example : 
 
```python
# server
def serverInit():
  global server
  server = Server.new()
  print("Server start")

def serverUpdate():
  for connection in server.new_connections:
    print(f"New connection : Player {connection.id} is {connection.status}")
    connection.send({"msg": "Welcome player "+str(connection.id)})
```

```python
# client
def init():
  global connection
  connection = ServerConnection.new()

def update():
  for message in connection.messages:
    print(message.msg)

def draw():
  screen.clear()
  screen.drawText(connection.status,0,0,20,"rgb(255,255,255)")
```