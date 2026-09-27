import app from "./app.js";

const port = Number(process.env.PORT || 4177);

app.listen(port, () => {
  console.log(`Saanjh Music API listening at http://localhost:${port}`);
});
