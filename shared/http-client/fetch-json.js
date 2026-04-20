async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawBody = await response.text();

  let parsedBody = null;
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (_error) {
      parsedBody = { message: rawBody };
    }
  }

  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    error.status = response.status;
    error.body = parsedBody;
    throw error;
  }

  return parsedBody;
}

module.exports = {
  fetchJson,
};
