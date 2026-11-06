const $ = (s) => document.querySelector(s);
const money = (cents) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function notify(text) {
  $("#notice").textContent = text;
  $("#notice").classList.remove("hidden");
  clearTimeout(window.noticeTimer);
  window.noticeTimer = setTimeout(
    () => $("#notice").classList.add("hidden"),
    6500,
  );
}
async function api(path, data) {
  const r = await fetch(
    path,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {},
  );
  const value = await r.json();
  if (!r.ok) throw Error(value.error || "Falha na solicitação");
  return value;
}
function bubble(text, cls = "") {
  const n = el("div", text, "bubble " + cls);
  $("#messages").append(n);
  $("#messages").scrollTop = $("#messages").scrollHeight;
}
$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#message").value.trim();
  if (!message) return;
  const button = $("#send");
  button.disabled = true;
  bubble(message, "user");
  $("#message").value = "";
  try {
    const result = await api("/api/chat", { message });
    bubble(result.reply);
    $("#mode").textContent =
      result.mode === "demo" ? "Modo demonstrativo" : "IA conectada";
    if (window.speakReply) window.speakReply(result.reply);
  } catch (e) {
    bubble(e.message);
  } finally {
    button.disabled = false;
  }
});
api("/api/health")
  .then(
    (h) =>
      ($("#mode").textContent =
        h.mode === "demo" ? "Modo demonstrativo" : "IA conectada"),
  )
  .catch((e) => notify(e.message));
let state,
  cart = {};
try {
  cart = JSON.parse(localStorage.getItem("cart") || "{}");
  if (!cart || typeof cart !== "object" || Array.isArray(cart)) cart = {};
} catch {
  cart = {};
}
function render() {
  const query = $("#search").value.toLocaleLowerCase();
  $("#products").replaceChildren();
  state.products
    .filter((p) =>
      (p.name + " " + p.category + " " + p.description)
        .toLocaleLowerCase()
        .includes(query),
    )
    .forEach((p) => {
      const card = el("article", undefined, "card product");
      card.append(
        el("div", p.icon, "art"),
        el("p", p.category, "eyebrow"),
        el("h3", p.name),
        el("p", p.description),
        el("strong", money(p.price), "price"),
        el("p", p.stock + " em estoque", "muted"),
      );
      const b = el("button", "Adicionar ao carrinho");
      b.disabled = p.stock === 0;
      b.onclick = () => {
        if ((cart[p.id] || 0) >= p.stock)
          return notify("Limite de estoque atingido.");
        cart[p.id] = (cart[p.id] || 0) + 1;
        renderCart();
      };
      card.append(b);
      $("#products").append(card);
    });
  renderCart();
}
function renderCart() {
  let total = 0;
  $("#cart").replaceChildren();
  for (const [id, quantity] of Object.entries(cart)) {
    const p = state.products.find((p) => p.id === id);
    if (!p || !Number.isInteger(quantity) || quantity <= 0) {
      delete cart[id];
      continue;
    }
    total += p.price * quantity;
    const row = el("div", undefined, "item");
    row.append(
      el("span", quantity + " × " + p.name + " · " + money(p.price * quantity)),
    );
    const remove = el("button", "−", "secondary");
    remove.setAttribute("aria-label", "Remover uma unidade de " + p.name);
    remove.onclick = () => {
      if (--cart[id] === 0) delete cart[id];
      renderCart();
    };
    row.append(remove);
    $("#cart").append(row);
  }
  if (!Object.keys(cart).length)
    $("#cart").append(el("p", "Seu carrinho está vazio."));
  $("#total").textContent = money(total);
  $("#checkout").disabled = total === 0;
  localStorage.setItem("cart", JSON.stringify(cart));
}
$("#search").oninput = () => state && render();
$("#checkout").onclick = async () => {
  const b = $("#checkout");
  b.disabled = true;
  try {
    const order = await api("/api/orders", {
      items: Object.entries(cart).map(([id, quantity]) => ({ id, quantity })),
    });
    cart = {};
    localStorage.removeItem("cart");
    $("#receipt").textContent =
      "Pedido " +
      order.id.slice(0, 8) +
      " registrado: " +
      money(order.total) +
      ". Demonstração, sem cobrança.";
    state = await api("/api/state");
    render();
  } catch (e) {
    notify(e.message);
    b.disabled = false;
  }
};
api("/api/state")
  .then((s) => {
    state = s;
    render();
  })
  .catch((e) => notify(e.message));
