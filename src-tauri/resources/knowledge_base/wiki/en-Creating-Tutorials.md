# Create tutorials for microStudio

microStudio offers a few series of interactive [Tutorials](https://microstudio.dev/tutorials) to get you
easily started. You can actually make similar tutorials of your own, to teach any specific use of microStudio
to anyone. It could be about programming, creating sprites, doing level design, making a specific kind of game... or anything you can think of.

Once you have created your own tutorial, you can easily share it by
sending a simple link. You can also make your tutorial public on microStudio Explore section,
or on your profile page only if you choose to make it "Unlisted".

In a very microStudio way, you can already test your tutorial while creating it ; you can have the tutorial
running in a separate tab and see the changes applied live to it! It could even be on a different PC!

The link below is an example of a tutorial made in microStudio... which teaches you how to create a tutorial in microStudio:

https://microstudio.dev/tutorial/microstudio/createtutorials/

*it is actually the tutorial version of this article!*

## Create your own tutorial

Your tutorial will have a set of steps. Each step has text content to be displayed to the user and  will also have the ability to highlight elements on the
microStudio UI, to move and resize the tutorial window, to navigate automatically through microStudio
main sections and in the project tabs.

### Create a project

You start by creating your tutorial as a microStudio project. While creating your project,
open the Advanced settings and select "Tutorial" as Project Type.

Your tutorial will be edited in the **Doc** tab of your project. The format you will use is
simply markdown, with a few elements specific to tutorials. First create the main title
of your Tutorial:

```markdown
# Title of my Tutorial
```

### Create Steps

You can create a series of steps. The marker for a new tutorial step will be a level 2 markdown title (line starting with ##),
such as ```## Step 1```. All that follows this marker will belong to that step, until a new step marker is found. There
you can add text, or a level 3+ title such as ```### Title of my Step 3```.

Add the following to your doc file, to create a simple sequence of 3 steps:

```markdown
## Step 1

### Step 1 title

## Step 2

### Step 2 title

## Step 3

### Step 3 title
```


### Test your tutorial

Notice that because you have set project type to ```Tutorial```, microStudio has
added a button ```Start Tutorial``` on the right. If you forgot to do it, it is still
time to open your project options and change Project Type to "Tutorial".

You can now click the button ```Start Tutorial```, which will open your work in progress in another browser tab.
Just like regular microStudio projects, your tutorial updates automagically while you are editing it!
You can thus switch to the other tab and back anytime to see how your tutorial is improving.


## Add more content

You may now add more text content to your steps. You can use markdown formatting to create titles, use emphasis,
insert blocks of code, tables etc. Just remember that titles of level 1 (#) and 2 (##) are reserved
(respectively for the title of your tutorial and to mark the beginning of a new step of the tutorial).

Let's add content into our Step 1:

````markdown
## Step 1

### Step 1 title

This is a paragraph of text with *some italics* and **some bold** characters.

```
// This is a code block
x = x + 1
```

This is a list:

* item 1
* item 2

##### I am a subtitle and below is a table:

|Parameter|Description|
|-|-|
|x|the coordinate along the horizontal axis|

[Link to microStudio](https://microstudio.dev)

````

### Special commands

All the syntax shown above is just standard markdown. The tutorial engine allows you to trigger special commands at any step.
These commands allow you to position and resize the tutorial window, to highlight elements of the user interface or to navigate to
different sections of microStudio.

In order to use them, you will add command lines right after the step definition mark.
A command line starts with a colon ```:```


##### example
```markdown
## Step 2

:position 40,40,30,30

:navigate projects.sprites

Text paragraph ...
```

In the example above, we use the commands ```position```and ```navigate``` in step "Step 2" of our tutorial. The available
commands will be explained below.

### Position and resize tutorial window

You can set the position and size of the tutorial window with the ```:position``` command. This is especially useful when
you think the tutorial window may be hiding a part of the UI that the user should be able to see.

```markdown
## This step requires some specific part of the UI to be visible

:position 40,40,30,30
```

This command accepts 4 comma-separated arguments: ```x, y, width, height```

|argument|description|
|-|-|
|x|The X position of the top-left corner of the tutorial window, in percentage of the total window width ; range: [0,100]|
|y|The Y position of the top-left corner of the tutorial window, in percentage of the total window height ; range: [0,100] |
|width|The width of the tutorial window, expressed in percentage of the total window width|
|height|The height of the tutorial window, expressed in percentage of the total window height|


### Add an overlay

You can add a full-window overlay which will hide the microStudio UI and make it inaccessible to the user. Use it
when you want to make sure the user will read your tutorial step, without being distracted or without touching the microStudio
UI until the next step.

```markdown
## This step adds an overlay to hide microStudio UI

:overlay
```


### Navigate to main section or project tab

You can force navigation to a specific section of the microStudio UI:

```markdown
## This step forces navigation to the Tutorials section of the microStudio site

:navigate tutorials
```

##### accepted values

|value|Navigation target|
|-|-|
|explore|the Explore section of the site|
|projects|the user's projects section of the site ("Create" in the main menu)|
|tutorials|the Tutorials section of the site|
|doc|the Documentation section of the site|
|about|the About section of the site|
|projects.code|the code tab of user's project (assuming a project is already opened)|
|projects.sprites|the sprites tab of user's project (assuming a project is already opened)|
|projects.maps|the code maps of user's project (assuming a project is already opened)|
|projects.sounds|the code sounds of user's project (assuming a project is already opened)|
|projects.music|the music tab of user's project (assuming a project is already opened)|
|projects.doc|the doc tab of user's project (assuming a project is already opened)|
|projects.options|the settings tab of user's project (assuming a project is already opened)|
|projects.publish|the publish tab of user's project (assuming a project is already opened)|



### Highlighting UI elements

You can set your tutorial step to highlight some part of the microStudio user interface.
You do that by using the command ```:highlight``` followed by a CSS selector for the HTML
element you want to highlight. You can use the built-in inspector in your browser to find the proper
selector for your chosen element. Most UI elements have a unique id, in which case the selector is
just # followed by the id.

##### example

```markdown
## This step will highlight the Explore menu button, which HTML id is menu-explore

:highlight #menu-explore
```

In case you just want the user to click the highlighted element, you can allow the tutorial
window to jump automatically to the next step as soon as the user will click the element. You do that by
adding the command line:

```markdown
:auto
```

### Sharing

You can easily share your tutorial to others by just sending them a copy of the URL your browser opened when
you clicked on "Start Tutorial". You can also make it public in the explore section of microStudio, just like
any other project, through the Publish tab of your project. You can mark it "Unlisted" if you want it to only
show up on your user public page.


### Copying / pasting from examples

There is a good source of examples in the built-in Tutorials section of microStudio. You can click on
the file icon of each tutorial, to display the raw source code of the tutorial, from which you may copy and
paste the parts you are interested in.
