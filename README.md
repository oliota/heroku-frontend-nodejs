# Heroku Frontend Node.js

Frontend interface for the Expense Manager API. Built using Bootstrap 5, jQuery, and AJAX, this project connects to the backend API hosted on Heroku.

---

## 🚀 Run Locally

You can serve the static files with any static server or by opening `index.html` directly in the browser.

To use with a local backend:

1. Open `js/config.js`
2. Replace the API URL with your local backend endpoint:

```js
const apiBase = "http://localhost:3000/api/v1/expenses";
```

Then open `index.html` in your browser.

---

## ☁️ Deploy to Heroku

This project can also be deployed as a Node.js static server on Heroku using Express.

### Example Setup

1. Create a simple Express server to serve `index.html` and static assets.
2. Include a `Procfile` with:

```txt
web: node server.js
```

3. Deploy to Heroku:

```bash
heroku login
heroku create heroku-frontend-nodejs --stack heroku-22
git push heroku master:main
```

---

## 🌍 Live Integration with Backend

To integrate with your live Heroku backend:

1. Open `js/config.js`
2. Set the `apiBase` to your Heroku backend URL:

```js
const apiBase = "https://heroku-backend-nodejs-XXXX.herokuapp.com/api/v1/expenses";
```

3. Commit and redeploy.

---

## 📦 Project Structure

```
heroku-frontend-nodejs/
├── index.html
└── js/
    ├── config.js         # API base URL
    ├── crud-core.js      # CRUD actions (add/edit/delete)
    └── crud-extended.js  # Load & render table
```

---

## ✨ Features

- Add/edit/delete expenses
- Real-time updates in the UI
- Modal confirmation for deletion
- Integrated with RESTful backend on Heroku
