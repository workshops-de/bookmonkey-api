<p align="center">
  <img src="logo.png" alt="boomonkey-logo" width="350px"/>
</p>

# bookmonkey-api

The bookmonkey-api is a demo api to list, get, create, update and delete books.
It's very handy for [workshops](https://workshops.de). It comes with its own documentation.

## Installation & Usage

* Run `npm install -g bookmonkey-api`.
* Start the api server with `bookmonkey-api`.
* Open the documentation on `http://localhost:4730/`

## Supported actions

    GET     /books          // Get all books
    GET     /books/:isbn    // Get a specific book by ISBN
    POST    /books          // Create a new book
    PUT     /books/:isbn    // Update a book by ISBN
    DELETE  /books/:isbn    // Delete a book by ISBN

## Credits

This project exists, thanks to all the people who contribute.

<a href="https://github.com/workshops-de/bookmonkey-api/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=workshops-de/bookmonkey-api" />
</a><br/><br/>

Additionally we would like to give credits to https://github.com/Farxa for creating the bookmonkey logo.
