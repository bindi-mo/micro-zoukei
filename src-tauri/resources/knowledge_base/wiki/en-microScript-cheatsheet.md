# microScript cheatsheet

This is a cheatsheet for microScript 2.0

## Variables

### local

```lua
f = function()
  local count = 0
  while count < 100
    (...)
  end
end // visibility of the local variable stops here, when the "block" where it was created ends
```

> Tip:
> * use local variables for temporary values in functions
> * Avoid mixing local and global variables with the same name

### global
```lua
score = 0
level = 1
```

### object

Variables, set during the course of an object method call, are made properties of the current object:
```lua
player = object
  position_x = 0
  position_y = 0
  setPosition = function(x,y)
    position_x = x // sets player.position_x
    position_y = y // sets player.position_y
  end
end
```

> This is shown above on a plain object, but also applies to class instances

> Global variables can still be changed from an object's method by using the prefix `global.`
>
> ```
> player = object
>   update = function()
>     global.score += 1
>   end
> end
> ```

### checking type

```
myvar.type

myobject.some_property.type
```

### delete properties

```
delete myobject.some_property
delete this.something
delete some_variable
delete myobject[getPropertyToDelete()]
```

#### values

|||
|-|-|
|`myvar.type == 0`|`myvar` is not defined|
|`myvar.type == "number"`|`myvar` is a number|
|`myvar.type == "string"`|`myvar` is a string|
|`myvar.type == "function"`|`myvar` is a function|
|`myvar.type == "list"`|`myvar` is a list|
|`myvar.type == "object"`|`myvar` is an object|

## Numbers

### formatting

```javascript
a = 1
b = 1.2
c = -4.5e-5    // = -4.5*10^(-5)
```

### hexadecimal
```javascript
h = 0x7FFF
```

### conversion

|||
|-|-|
|```Number.parse( string )```|Parses a string and returns a number|
|```num_variable.toString()```|Returns the string representation of a number|

### operations

|||||
|-|-|-|-|
|`a + b`|`a - b`|`a * b`|`a / b`|
|`a ^ b`|a to the exponent of b|||
|`a % b`|remainder|||
|`a & b`|binary and|||
|`a \| b`|binary or|||
|`a += b`|`a -= b`|`a *= b`|`a /= b`|
|`a %= b`|`a &= b`|`a \|= b`||

## Strings

### delimiters
|||
|-|-|
|```"double-quote delimited string"```||
|```'simple-quote delimited string'```||
|```"""triple double-quote delimited string"""```||

### escaping
|||
|-|-|
|```"\""```|double quote|
|```"\n"```|line feed|
|```"\\"```|backslash|
|```"double-quote: "" "```|a pair of double-quotes is parsed as a single double-quote|



### operations

|||
|-|-|
|```string1 + string2```|Concatenates two strings|
|```string.length```|Length of the string|
|```string.substring( i1, i2)```|Returns a substring of the character string, starting at index i1 and ending at index i2|
|```string.startsWith( s )```|Returns whether string starts exactly with ```s```|
|```string.endsWith( s )```|Returns whether string ends exactly with ```s```|
|```string.indexOf( s )```|Index of the first occurrence of ```s``` in ```string```, or -1|
|```string.lastIndexOf(s)```|Index of the last occurrence of ```s``` in ```string```, or -1|
|```string.replace(s1,s2)```|Returns a new string with ```s1``` replaced by ```s2```|
|```string.toUpperCase()```|Returns the string converted to upper case|
|```string.toLowerCase()```|Returns the string converted to lower case|
|```string.split(s)```|Divides the string into a list of substrings, using the separator provided|
|```string.charAt( position )```|Returns the character at the given position|
|```string.charCodeAt( position )```|Returns the UTF-16 character code at given position|
|```string.concat( str2 )```|Returns ```string + str2```|
|```string.trim()```|Returns string with leading and trailing space characters removed (space, tabs, LF)|
|```string.trimEnd()```|Returns string with trailing space characters removed (space, tabs, LF)|
|```string.trimStart()```|Returns string with leading space characters removed (space, tabs, LF)|
|||
|```String.fromCharCode( code )```|Returns the character of the given code, as a string|

## Lists

### operations

|||
|-|-|
|```list = []```|Empty list|
|```list.length```|Length of the list|
|```list.push( element )```|Adds the element to the end of the list|
|```list.pop()```|Removes the last element from the list and returns it (or `0` if empty)|
|```list += element```|Same|
|```list.insert( element )```|Inserts an element at the beginning of the list|
|```list.insertAt( element, index)```|Inserts an element at the given index in the list|
|```list.indexOf( element )```|Returns the position of the element in the list else -1|
|```list.contains( element )```|Returns 1 when ```element``` is in the list else 0|
|```list.removeAt( index )```|Removes from the list the element at position ```index```|
|```list.removeElement( element )```|Removes from the list ```element```, if it can be found in the list|
|```list1.concat( list2 )```|Returns a new list obtained by appending list2 to list1|
|```list1 += list2```|Same|
|```list3 = list1 + list2```|```list3``` becomes the concatenation of list1 and list2|
|```list.sortList( func )```|sorts the list using the comparison function passed|

## Objects

### create

```
obj = object
  x = 1
  y = 2
end
```

### properties

```
obj.x = 2
obj["y"] = obj.x + 3
```
### object methods

```
obj.incrementX = function() x += 1 end
obj.incrementX()
```

## Functions

### definition

```lua
add = function( x, y )
  return x+y
end
```

### invocation

```lua
five = add( 2, 3 )
```

### default args

```lua
display = function( text="placeholder text" )
  print(text)
end

display("My text")
display()
```

### implicit returns

```lua
square = function(x) x*x end
```


## Loops

### for loop

```lua
for i=1 to 10
  print(i)
end

for i=10 to 0 by -1
  print("countdown: "+i)
end


// Iterate over elements in a list

list = [1,2,3,4,5]
for element in list
  print(element)
end


// Iterate over properties of an object

obj = object
  x = 1
  y = 2
  z = 3
end

for prop in obj
  print(prop + " = " + obj[prop])
end
```

### while loop

```
count = 0
while count < 1000
  print(count)
  count += 1
end
```

## Conditional statements

```lua
if x == 1 then
  print("one")
elsif x == 2 then
  print("two")
elsif x > 2 then
  print("more")
else
  print("less than one")
end

// conditionals are expressions and also return a value

sign_x = if x >= 0 then "positive" else "negative" end
```


## Random

```lua
// random number in the rangle [0 .. 1]
random.next()

// random integer in the range [0 .. 99]
random.nextInt(100)

// reseed the random number generator
random.seed(1234)

// clone the random number generator
r = random.clone()

// reseeded clone of a random number generator
r = random.clone(1234)

// use the clone as the original random object
r.next()
```


## Schedule

### after
```lua
after 5 seconds do
  backToMainMenu()
end
```

### every
```lua
every 200 milliseconds do
  score += 100
end
```

### do
```lua
do     // the code enclosed will be executed in a new separate thread
  for i=1 to 100000000
    doHeavyWork(i)
  end
end
```

### sleep

```lua
sleep 1 second

sleep 200 milliseconds

sleep 200 // if unspecified, it is milliseconds by default
```

## Threads

`after`, `every` and `do` all return a thread value:

```lua
thread = every 1000 do print(counter += 1) end

thread.pause()

thread.resume()

thread.stop()
```

### list secondary threads
```lua
for t in system.threads
  t.pause()
end
```

## Predefined

### predefined functions

||||||
|-|-|-|-|-|
|`round( x )`|`sin( x )`|`sind( x )`|`sqrt( x )`|`min( x, y )`|
|`floor( x )`|`cos( x )`|`cosd( x )`|`log( x )`|`max( x, y )`|
|`ceil( x )`|`tan( x )`|`tand( x )`|`exp( x )`|
|`abs( x )`|`acos( x )`|`asind( x )`|`pow( x, y )`|
||`asin( x )`|`acosd( x )`|
||`atan( x )`|`atand( x )`|
||`atan2( y, x )`|`atan2d( y, x )`|

### predefined constants

|constant|value|
|-|-|
|`PI`|Number Pi|
|`true`|Predefined to `1`|
|`false`|Predefined to `0`|

## Classes

### definition

```
MyClass = class extends MyParentClass
  constructor = function( x, y, size )
    super( x, y )
    this.size = size
  end

  getSize = function()
    return size
  end
end
```

### use

```
my_object = new MyClass( 10, 12, 20 )
print( my_object.getSize() )
```


## Comments
```javascript
// this is a line comment
x = 1 // this is a line end comment

/* This is
  a block
  comment
  */

// below is an inline comment
if /*true*/ false then doSomething() end
```
