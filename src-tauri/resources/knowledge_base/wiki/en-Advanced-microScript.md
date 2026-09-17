# Advanced microScript


## Prototypes for the core types

microScript 2.0 introduces the `Object`, `List`, `String`, `Number` and `Function` prototypes. Such prototypes are collections of functions that you can define and then use on values of their corresponding types.

Example: we will create a function which, when applied to a string, returns the same string with the first letter capitalized:

```lua
String.capitalized = function()
  if this.length > 0 then
    this[0].toUpperCase() + this.substring(1)
  else
    ""
  end
end
```

> Note that in the course of the defined function, `this` refers to the string instance which the function is called on.

We can then use the function on any string value like this:
```lua
lastname = "doe".capitalized()
firstname = "john"
firstname = firstname.capitalized()
city = "paris"
print( firstname + " " + lastname + " " + city.capitalized() )
```
Note that string values are always constants. Any function that looks like transforming a string does not change the original string value,
it just returns a new string value holding the transformed string.

Another example:
```lua
List.modulo = function(mod)
  local result = []
  for i=0 to this.length-1 by mod
    result += this[i]
  end
  result
end
```

Once this is defined, you can call the function `modulo` on lists, which will return a subset of the elements in the list:

```lua
[1,2,3,4,5,6,7,8].modulo(2)
[1,3,5,7]
```


## Operator overloading

### For classes

When creating classes, you can define how the microScript operators `+ - * / % | &` should be applied to object instances of your class.

```lua
Vector3 = class
  constructor = function(x,y,z)
    this.x = x
    this.y = y
    this.z = z
  end

  "+" = function(a,b)
    new Vector3( a.x+b.x, a.y+b.y, a.z+b.z )
  end
end
```

When you define such a binary operator ("binary" meaning two arguments here) like + , think that it will be used this way: `a + b`. `a` and `b` will be the two arguments to your overloading function.

> Note: when `a <op> b` is encountered in the code and `a` is not a number, the operation to carry out is decided depending on the type or class of `a`. If `a` is a List and `<op>` is defined in the List prototype, then that will be the operation carried out. If `a` is an instance of a class `Vector3` and the class defines `<op>` then that will be the operation carried out.

> special case: when an occurence of `-b` is found in the code ; if the prototype or parent class of `b` is found to define the binary operator `-`, then the function ( a, b ) is called with `a` set to `0` and `b` set to the value of `b`. Thus you can implement the `-` operator for your Vector3 class this way:
```lua
Vector3."-" = function( a, b )
  if a then
    new Vector3( a.x-b.x, a.y-b.y, a.z-b.z )
  else
    new Vector3( -b.x, -b.y, -b.z )
  end
end
```

### For core types

You can also overload operators for the core types of microStudio. Example:
```lua
String."*" = function(a,b)
  local result = a
  for i = 2 to b by 1
    result += a
  end
  result
end
```

Use:

```lua
"abc" * 5
"abcabcabcabcabc"
```

> Note: Overloading binary operators `+ - * / % | &` for the Number prototype is not supported!

## Manipulating classes / prototypes


## Embedding JavaScript
You can now embed JavaScript code in your microScript code. This allows you to add features to your app that may not be provided by the microStudio core APIs.

> Note: you cannot call microScript functions or instanciate microScript classes from your JavaScript code.
> You **can** call JavaScript functions or instantiate JavaScript classes from your microScript code.

> Note: JavaScript is currently supported on all existing target platforms for your microStudio app, because all rely on some HTML5 engine. In the future, more export
targets may be added, for which the support of JavaScript may not be included.

You have two ways to execute JavaScript code:

### embed a snippet
You can run JavaScript code by calling `system.javascript( javascript_code )`
Example:
```
  system.javascript("""
    this.setFullscreen = function() { document.body.requestFullscreen() } ;
  """)
```
Your JavaScript code is executed with `this` set to the microScript `global` context. Thus by
setting `this.setFullscreen = ...`, you are creating a global function which you can subsequently
call from your microScript code.

### create a javascript file
You can create a whole JavaScript file, simply by starting your file with `// javascript` followed by a newline.

Example:

```
// javascript

this.setFullscreen = function() { document.body.requestFullscreen() } ;
```

The microScript global context is also provided as a variable named `global`. You can thus write:

```
// javascript

global.setFullscreen = function() { document.body.requestFullscreen() } ;
```
