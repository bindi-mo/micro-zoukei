# Networking

The networking features in microStudio allow you to create and run your online multiplayer game.
microStudio handles all the difficult stuff for you, that is to say you won't have to set up and run your own
server. You will just code your client and server in microStudio and run them directly from
the microStudio editor. Of course you can also join your multiplayer game from another PC or smartphone anytime.

Networking must be activated in your project settings. Once activated, you will notice a few changes
in the code and run tab, allowing you to start a server and run multiple clients. Server and client share
the same code base ; the client design follows the usual `init / update / draw` pattern, while the server
will use `serverInit / serverUpdate`.


> Note on latency: when you are in development stage and taking advantage of the microStudio default handling
> of networking, you may experience high latency, depending on where you are on the globe. If this were to be a problem for you,
> you will find solutions at the end of this document (such as: using the standalone app, a local install, or setting up your own game server)

## Setup

### enable networking

You can enable Networking for your project when you create it (expand the advanced settings). If your project
is already created, you can also activate Networking in the project settings (also expand the advanced settings).

### client and server

The networking API in microStudio relies on a client / server model. Client and Server share the same code base, which
has a few practical advantages, such as allowing to use the same gameplay or physics classes and functions in both the client
and the server.

The game client works exactly like any other microStudio game, following the usual `init / update / draw` pattern.

The game server initialization and main loop rely on the two new functions:

* `serverInit()` called by the engine when the server starts
* `serverUpdate()` called 60 times per second, always

## Simple example

Here is the simplest networked program you can do, to illustrate the basics:

### server code

You will usually create a new Server instance in `serverInit()`, and assign it to a global variable, here `server`.
Then implement `serverUpdate()` to check for new connections, client messages, closed connections and such. In this simple example,
we will only check for new connections and print them:

```lua
serverInit = function()
  server = new Server()
end

serverUpdate = function()
  for connection in server.new_connections
    print(connection)
  end
end
```

### client code

On the client side, we will use the `ServerConnection` class to connect to the server ; once the connection is created,
our game will just display the status of the connection:

```lua
init = function()
  connection = new ServerConnection()
end

draw = function()
  screen.clear()
  screen.drawText(connection.status,0,0,20,"rgb(255,255,255)")
end
```

### run server

After enabling Networking for our project, a dedicated "Server" toolbar shows up in the UI. You can click on the "Start" button
there to start your server. One button starts the server within the editor, the other starts the server in a new browser tab. We recommend to
start the server within the editor for simplicity.

### run clients

You can then start your game (client) the usual way, using the "Run" button. On the Run toolbar, notice that the last button "Detach run window"
has changed: when Networking is active, this button allows you to start and use multiple instances of your game client. Start several clients and watch
the server console. Try stopping the server and see how the clients are affected.

## Server API

### start server

In most cases, you will start the server in your `serverInit()` function. You do that by creating a new instance of the class `Server`: 
```lua
serverInit = function()
  server = new Server()
end
```
### new connections

Your `serverUpdate()` function will be called 60 times per second. This is where you can check for new connections or messages received from the clients.
Here is how to check for new connections:

```
serverUpdate = function()
  for connection in server.new_connections
    print(connection)
  end
end
```

### read messages
Still in `serverUpdate()` you can read new messages received from the clients
```
  for message in server.messages
    print("received message:")
    print(message.data)
    print("from:")
    print(message.connection)
  end
```

Another way to do the same is to iterate over the active connections ; this way you will have the messages sorted by connected clients:

```
  for client in server.active_connections
    for message in client.messages
      print("received message:")
      print(message.data)
      print("from:")
      print(message.connection)
    end
  end
```

### send messages

Here is how to send messages to clients (connections) ; we will send "Hello!" to all currently connected clients:

```lua
  for client in server.active_connections
    client.send( "Hello!" )
  end
```
You can send all kinds of data: a character String, a Number, a List or an Object. Note that Objects and Lists will be
serialized and should not include circular references.

### disconnect client

You can disconnect a client simply with:

```lua
  client.disconnect()
```

### closed connections

Within `serverUpdate()`, you can also check the list of connections that were just closed in this 1/60s time slice:

```lua
  for client in server.closed_connections
    print("this client was just disconnected:")
    print(client)
  end
```

### stopping the server

You can stop the server by calling `server.stop()`. All clients will be disconnected.

## Client API

### start connection

On the client side, you can initiate a connection to your game server with:

```lua
  connection = new ServerConnection()
```

### read messages

Incoming messages from the server should be read from the course of your `update()` function (or in a subroutine which is called from `update()`).
This is the only way to ensure that you won't miss any messages and you won't read the same message twice.

```lua
update = function()
  for message in connection.messages
    print("message received from the server:")
    print(message)
  end
end
```
You will receive the exact same data sent by the server, which may be a Number, a String, an Object or a List.

### send messages

You can send a message to the server with:

```lua
  connection.send(data)
```
`data` here could be any Number, String, List or Object you want to send to the server. Here again, make sure there can't
be circular references in your data.

### connection status

You can check the connection status with `connection.status`. You will get one of the following:

|status|description|
|-|-|
|`"connecting"`|the connection is being established|
|`"connected"`|the client is connected to the game server|
|`"disconnected"`|the connection is closed / client disconnected|
|`"error"`|a connection error happened|

## Public game

Once your online multiplayer game is finished, you may publish it to the microStudio Explore section. Once your game will be
published, you should maintain a game server running on your end. You can do that by starting the server in a new browser tab and
keeping this tab open.

Also in the event your server would not be available, make sure to correctly inform the user in the game client. That is to say, if the
client is unable to connect to the server, display a message saying so in your game.

## Export

You can export your game client as an HTML5 app in one click, as always.

### export server

You can also export your game server as a standalone NodeJS app ready to be installed on your own server.
To proceed, open the Publish tab of your project and click "Export Server as NodeJS app". Then:
* unzip the archive on your server
* change directory to the unzipped folder
* run `npm install`
* edit `config.json` to set the desired port for your game server
* run `npm run start` to start your game server

### local server

If your server is your own PC, you can easily test your local server by running your game client. You need to set
your game client to connect to your own server instance, and not anymore to the microStudio default relay service.
You can specify the address of your own server when creating the ServerConnection in the client:

```
connection = new ServerConnection( "ws://localhost:3000" )
```
You should then export your game client, run it locally (through a local HTTP server) to test your local server.

### public server

Once you have tested your server locally, you can install it on a public server. You will have to configure SSL (HTTPS / WSS) for this,
as this is a browser requirement nowadays. There are multiple ways to achieve this, here is one of them:
* you must own a web domain to do this
* install your server and set it to run on a local port, e.g. 3000
* install nginx and configure it to act as a reverse proxy to your local server, running on your domain or a subdomain
* install and run CERTBOT to create your SSL certificate

Then set your game client to connect to your own server by passing a websocket address when creating a ServerConnection:

```
connection = new ServerConnection( "wss://my.owndomain.ext" )
```

## Note on latency

> When you are in development stage and taking advantage of the microStudio default handling
> of networking, you may experience high latency, depending on where you are on the globe. The bright side is
> that it will force you to create the optimizations and interpolations required for a smooth experience whatever
> the player's latency. However, you may also need to work with reduced latencies sometimes, here are solutions for you:
> * one solution is to work with the standalone microStudio app ; networking is equally managed by microStudio, but everything being local, you will have zero latency
> * another solution is to clone microStudio and run your own install locally, you will have zero latency too.
> * another solution is to keep working online on microstudio.dev, but also export your server code and install it on your own public server ; you can then set your client to connect to your own server (see above) and keep working on the client on microstudio.dev 



