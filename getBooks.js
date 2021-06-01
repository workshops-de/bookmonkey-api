const fetch = require('node-fetch');
const fs = require('fs');

async function download(url, name) {
  const response = await fetch(url);
  const buffer = await response.buffer();
  fs.writeFile(`./public/covers/${name}.png`, buffer, () => 
    console.log('finished downloading!'));
}

async function createBook(bookIsbn) {
  const response = await fetch(`https://api.itbook.store/1.0/books/${bookIsbn}`);
  const book = await response.json();

  const {title, subtitle, isbn13: isbn, desc: abstract, authors: author, publisher, price, pages} = book;

  await download(book.image, book.isbn13);

  return {
    id: isbn,
    title,
    subtitle,
    isbn,
    abstract,
    author,
    publisher,
    price,
    numPages: +pages,
    cover: `http://localhost:4730/covers/${isbn}.png`,
  };
}

async function getBooks(page) {
  const response = await fetch(`https://api.itbook.store/1.0/search/web&page=${page}`);
  const json = await response.json();

  return await Promise.all(json.books.map(async (book) => {
    return await createBook(book.isbn13);
  }));
}

(async function() {
  const books = await Promise.all(Array.from({length: 25}, (_, i) => i + 1).map(getBooks));

  fs.writeFile('./db.json', JSON.stringify({
    books: books.flat(),
  }), () => {
    console.log('db.json file created!')

    // File destination.txt will be created or overwritten by default.
    fs.copyFile('./db.json', './db-original.json', (err) => {
      if (err) throw err;
      console.log('db.json was copied to db-original.json');
    });
  })
}());