# Create libraries for microStudio

You can create microStudio libraries, either for your own usage or for everyone. A library is a set of functions or classes
that perform a specific task and can be reused across different projects.

Libraries can be imported to your project by clicking "Import Libraries" in the Code tab.

## Organizing code

This is the recommended way to organize source code files for your library:

### lib folder
Under a folder "lib", store all the source code files that make up your library. These files will be imported to the user's project whenever a user imports your library.

### make a demo
It is recommended to make a good demo for your library ; you can do that by creating more source code files, outside the "lib" folder. These files will not be imported as part of the lib, they only serve for your demo.

## Documentation
You should create a documentation for your library. You do that in the Doc tab of your library project, using markdown. Your documentation will be automatically accessible in the Documentation section when working on a project which imported your library.


## Notes

> When you or another user imports a library, a full copy of the library source code is added to the project, under lib/lib_author/lib_slug/*. This copy can be removed by deinstalling the library.
> You are not supposed to edit, move or delete the imported library files manually, unless you know what you are doing.

> When a library is updated, your project will not automatically receive the update. If you want to update your copy of the library, you can just uninstall and reinstall it.
