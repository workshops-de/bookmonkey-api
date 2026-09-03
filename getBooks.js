const fs = require('node:fs/promises');

async function download(url, name) {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(`./public/covers/${name}.png`, buffer);
  console.log('finished downloading!');
}

async function createBook(bookIsbn) {
  const response = await fetch(`https://api.itbook.store/1.0/books/${bookIsbn}`);
  const book = await response.json();

  const {title, subtitle, isbn13: isbn, desc: abstract, authors: author, publisher, price, pages, year} = book;

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
    publishedAt: year ? `${year}-01-01` : null,
    coAuthors: [],
  };
}

async function getBooks(page) {
  const response = await fetch(`https://api.itbook.store/1.0/search/web&page=${page}`);
  const json = await response.json();

  return Promise.all(json.books.map((book) => createBook(book.isbn13)));
}

(async function() {
  const books = await Promise.all(Array.from({length: 25}, (_, i) => i + 1).map(getBooks));

  await fs.writeFile('./db.json', JSON.stringify({
    books: books.flat(),
  }));
  console.log('db.json file created!');

  await fs.copyFile('./db.json', './db-original.json');
  console.log('db.json was copied to db-original.json');
}());
