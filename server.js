require("dotenv").config();
const express = require("express");


const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const rateLimit = require("express-rate-limit");
const path = require("path");
const crypto = require("crypto");
const app = express();

app.get("/api/health", (req, res) => {
  const conectado = mongoose.connection.readyState === 1;

  res.status(conectado ? 200 : 503).json({
    ok: conectado,
    service: "kikiriki-mvp",
    database: conectado ? "connected" : "unavailable"
  });
});

const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/kikiriki_mvp";
const port = Number(process.env.PORT || 3000);
const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  console.error("Configura SESSION_SECRET (mínimo 32 caracteres) en .env");
  process.exit(1);
}
const opts = { timestamps: false, versionKey: false };
const Counter = mongoose.model(
  "Counter",
  new mongoose.Schema({ _id: String, value: Number }, opts),
);
const Employee = mongoose.model(
  "Employee",
  new mongoose.Schema(
    {
      id: { type: Number, unique: true },
      name: String,
      username: { type: String, unique: true },
      password: String,
      role: { type: String, enum: ["admin", "empleado"] },
      active: { type: Boolean, default: true },
    },
    opts,
  ),
);
const Product = mongoose.model(
  "Product",
  new mongoose.Schema(
    {
      id: { type: Number, unique: true },
      name: String,
      category: String,
      description: String,
      price: Number,
      stock: Number,
      emoji: String,
      active: { type: Boolean, default: true },
    },
    opts,
  ),
);
const Supply = mongoose.model(
  "Supply",
  new mongoose.Schema(
    {
      id: { type: Number, unique: true },
      name: { type: String, unique: true },
      unit: String,
      quantity: Number,
      minimum: Number,
    },
    opts,
  ),
);
const InventoryMove = mongoose.model(
  "InventoryMove",
  new mongoose.Schema(
    { supply_id: Number, change: Number, reason: String, created_at: String },
    opts,
  ),
);
const Order = mongoose.model(
  "Order",
  new mongoose.Schema(
    {
      id: { type: Number, unique: true },
      customer: String,
      phone: String,
      address: String,
      notes: String,
      mode: String,
      status: { type: String, default: "pendiente" },
      total: Number,
      created_at: String,
      items: [
        {
          product_id: Number,
          product_name: String,
          quantity: Number,
          unit_price: Number,
          _id: false,
        },
      ],
    },
    opts,
  ),
);
const seeds = [
  [
    "Pollo asado entero",
    "Pollos",
    42000,
    "Pollo asado al carbón, acompañado de papas y arepas.",
    18,
    "🍗",
  ],
  [
    "Medio pollo asado",
    "Pollos",
    23000,
    "Media porción del sabor tradicional.",
    24,
    "🍗",
  ],
  [
    "Pollo broaster",
    "Pollos",
    28000,
    "Porción crujiente de pollo broaster.",
    20,
    "🍗",
  ],
  [
    "Bandeja Kikiriki",
    "Bandejas",
    32000,
    "Pollo, arroz, papas y acompañamientos.",
    16,
    "🍽️",
  ],
  [
    "Arroz con pollo",
    "Arroces",
    22000,
    "Arroz con pollo preparado al estilo de la casa.",
    22,
    "🍚",
  ],
  [
    "Sopa del día",
    "Sopas",
    14000,
    "Sopa casera, consultar disponibilidad.",
    15,
    "🥣",
  ],
  ["Papas fritas", "Porciones", 8000, "Porción de papas doradas.", 40, "🍟"],
  ["Gaseosa personal", "Bebidas", 5000, "Bebida gaseosa fría.", 50, "🥤"],
];
const now = () => new Date().toISOString();
async function nextId(name) {
  const c = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return c.value;
}
function bad(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function str(obj, key, max = 160, required = true) {
  const v = obj[key] ?? "";
  if (typeof v !== "string" || v.trim().length > max || (required && !v.trim()))
    bad(`${key}: dato obligatorio o demasiado largo`);
  return v.trim();
}
function int(v, key, min = 0) {
  if (!Number.isInteger(v) || v < min) bad(`${key}: valor inválido`);
  return v;
}
function num(v, key, min = 0) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > 100000)
    bad(`${key}: valor inválido`);
  return v;
}
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
function logged(req, res, next) {
  if (!req.session.user)
    return res.status(401).json({ error: "Debes iniciar sesión" });
  next();
}
function admin(req, res, next) {
  if (req.session.user?.role !== "admin")
    return res
      .status(403)
      .json({ error: "Acceso exclusivo del administrador" });
  next();
}
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(
  session({
    name: "kikiriki.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: "sessions",
    }),
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);
app.use(
  "/api/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiados intentos de acceso" },
  }),
);
app.use((req, res, next) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    const host = req.get("host");
    if (origin) {
      try {
        if (new URL(origin).host !== host)
          return res.status(403).json({ error: "Origen no permitido" });
      } catch {
        return res.status(403).json({ error: "Origen inválido" });
      }
    }
  }
  next();
});
app.get(
  "/api/menu",
  wrap(async (req, res) =>
    res.json(
      await Product.find({ active: true })
        .select("-_id")
        .sort({ category: 1, name: 1 })
        .lean(),
    ),
  ),
);
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));
app.post(
  "/api/login",
  wrap(async (req, res) => {
    const username = str(req.body, "username", 60),
      password = str(req.body, "password", 200);
    const employee = await Employee.findOne({ username, active: true }).lean();
    if (!employee || !(await bcrypt.compare(password, employee.password)))
      bad("Usuario o contraseña incorrectos", 401);
    req.session.regenerate((e) => {
      if (e) return res.status(500).json({ error: "Error al crear sesión" });
      req.session.user = {
        id: employee.id,
        name: employee.name,
        role: employee.role,
      };
      res.json({ ok: true, user: req.session.user });
    });
  }),
);
app.post("/api/logout", (req, res, next) =>
  req.session.destroy((err) =>
    err ? next(err) : (res.clearCookie("kikiriki.sid"), res.json({ ok: true })),
  ),
);
app.post(
  "/api/orders",
  wrap(async (req, res) => {
    const d = req.body,
      customer = str(d, "customer", 90),
      phone = str(d, "phone", 25),
      address = str(d, "address", 180),
      notes = str(d, "notes", 400, false),
      mode = d.mode;
    if (!["domicilio", "recoger"].includes(mode))
      bad("Tipo de entrega inválido");
    if (!Array.isArray(d.items) || !d.items.length || d.items.length > 30)
      bad("Selecciona productos");
    const quantities = new Map();
    for (const line of d.items) {
      if (!line || typeof line !== "object") bad("Producto inválido");
      const pid = int(line.product_id, "Producto", 1),
        q = int(line.quantity, "Cantidad", 1);
      quantities.set(pid, (quantities.get(pid) || 0) + q);
      if (quantities.get(pid) > 50) bad("Cantidad máxima de 50 por producto");
    }
    // Reserva de stock con comparación atómica; se revierte si algún producto no está disponible.
    const reserved = [];
    try {
      const items = [];
      let total = 0;
      for (const [pid, q] of quantities) {
        const p = await Product.findOneAndUpdate(
          { id: pid, active: true, stock: { $gte: q } },
          { $inc: { stock: -q } },
          { new: false },
        ).lean();
        if (!p)
          bad(
            `Producto ${pid}: sin existencias suficientes o no disponible`,
            409,
          );
        reserved.push({ pid, q });
        items.push({
          product_id: pid,
          product_name: p.name,
          quantity: q,
          unit_price: p.price,
        });
        total += q * p.price;
      }
      const id = await nextId("orders");
      await Order.create({
        id,
        customer,
        phone,
        address,
        notes,
        mode,
        status: "pendiente",
        total,
        created_at: now(),
        items,
      });
      res.status(201).json({ ok: true, id, total });
    } catch (e) {
      for (const { pid, q } of reserved)
        await Product.updateOne({ id: pid }, { $inc: { stock: q } });
      throw e;
    }
  }),
);
app.get(
  "/api/orders",
  logged,
  wrap(async (req, res) =>
    res.json(
      await Order.find().select("-_id").sort({ id: -1 }).limit(200).lean(),
    ),
  ),
);
app.patch(
  "/api/orders/:id",
  logged,
  wrap(async (req, res) => {
    const id = Number(req.params.id),
      status = req.body.status;
    if (
      !Number.isInteger(id) ||
      !["pendiente", "preparacion", "listo", "entregado", "cancelado"].includes(
        status,
      )
    )
      bad("Estado inválido");
    const transitions = {
      pendiente: ["preparacion", "cancelado"],
      preparacion: ["listo", "cancelado"],
      listo: ["entregado", "cancelado"],
    };
    const order = await Order.findOne({ id });
    if (!order) bad("Pedido inexistente", 404);
    if (!transitions[order.status]?.includes(status))
      bad("Cambio de estado no permitido", 409);
    const changed = await Order.updateOne(
      { id, status: order.status },
      { $set: { status } },
    );
    if (!changed.modifiedCount)
      bad("El pedido fue actualizado por otra operación", 409);
    if (status === "cancelado")
      for (const line of order.items)
        await Product.updateOne(
          { id: line.product_id },
          { $inc: { stock: line.quantity } },
        );
    res.json({ ok: true });
  }),
);
app.get(
  "/api/products",
  logged,
  wrap(async (req, res) =>
    res.json(await Product.find().select("-_id").sort({ id: -1 }).lean()),
  ),
);
app.post(
  "/api/products",
  logged,
  admin,
  wrap(async (req, res) => {
    const d = req.body;
    await Product.create({
      id: await nextId("products"),
      name: str(d, "name"),
      category: str(d, "category", 60),
      description: str(d, "description", 400, false),
      price: int(d.price, "Precio"),
      stock: int(d.stock, "Existencias"),
      emoji: str(d, "emoji", 8, false) || "🍗",
      active: true,
    });
    res.status(201).json({ ok: true });
  }),
);
app.patch(
  "/api/products/:id",
  logged,
  admin,
  wrap(async (req, res) => {
    const d = req.body,
      id = int(Number(req.params.id), "Producto", 1);
    if (typeof d.active !== "boolean") bad("Estado inválido");
    const update = {
      name: str(d, "name"),
      category: str(d, "category", 60),
      description: str(d, "description", 400, false),
      price: int(d.price, "Precio"),
      stock: int(d.stock, "Existencias"),
      emoji: str(d, "emoji", 8, false) || "🍗",
      active: d.active,
    };
    const result = await Product.updateOne({ id }, { $set: update });
    if (!result.matchedCount) bad("Producto inexistente", 404);
    res.json({ ok: true });
  }),
);
app.get(
  "/api/supplies",
  logged,
  wrap(async (req, res) =>
    res.json(await Supply.find().select("-_id").sort({ name: 1 }).lean()),
  ),
);
app.post(
  "/api/supplies",
  logged,
  admin,
  wrap(async (req, res) => {
    const d = req.body;
    await Supply.create({
      id: await nextId("supplies"),
      name: str(d, "name"),
      unit: str(d, "unit", 30),
      quantity: num(d.quantity, "Cantidad"),
      minimum: num(d.minimum, "Mínimo"),
    });
    res.status(201).json({ ok: true });
  }),
);
app.post(
  "/api/supplies/:id/move",
  logged,
  admin,
  wrap(async (req, res) => {
    const id = int(Number(req.params.id), "Insumo", 1),
      change = req.body.change,
      reason = str(req.body, "reason", 160);
    if (
      typeof change !== "number" ||
      !Number.isFinite(change) ||
      change === 0 ||
      Math.abs(change) > 100000
    )
      bad("Movimiento inválido");
    const s = await Supply.findOneAndUpdate(
      { id, quantity: { $gte: -change } },
      { $inc: { quantity: change } },
      { new: true },
    );
    if (!s) bad("Insumo inexistente o inventario insuficiente", 409);
    await InventoryMove.create({
      supply_id: id,
      change,
      reason,
      created_at: now(),
    });
    res.json({ ok: true });
  }),
);
app.get(
  "/api/employees",
  logged,
  admin,
  wrap(async (req, res) =>
    res.json(
      await Employee.find()
        .select("id name username role active -_id")
        .sort({ id: 1 })
        .lean(),
    ),
  ),
);
app.post(
  "/api/employees",
  logged,
  admin,
  wrap(async (req, res) => {
    const d = req.body,
      name = str(d, "name"),
      username = str(d, "username", 60),
      password = str(d, "password", 200),
      role = d.role;
    if (password.length < 10) bad("La clave debe tener al menos 10 caracteres");
    if (!["admin", "empleado"].includes(role)) bad("Rol inválido");
    await Employee.create({
      id: await nextId("employees"),
      name,
      username,
      password: await bcrypt.hash(password, 12),
      role,
      active: true,
    });
    res.status(201).json({ ok: true });
  }),
);
app.get(
  "/api/reports",
  logged,
  admin,
  wrap(async (req, res) => {
    const delivered = await Order.find({ status: "entregado" }).lean();
    const pending = await Order.countDocuments({
      status: { $nin: ["entregado", "cancelado"] },
    });
    let revenue = 0;
    const tops = {},
      days = {};
    for (const o of delivered) {
      revenue += o.total;
      const day = o.created_at.slice(0, 10);
      days[day] = (days[day] || 0) + o.total;
      for (const i of o.items)
        tops[i.product_name] = (tops[i.product_name] || 0) + i.quantity;
    }
    res.json({
      orders: delivered.length,
      revenue,
      pending,
      top: Object.entries(tops)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, quantity]) => ({ name, quantity })),
      by_day: Object.entries(days)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 14)
        .map(([day, total]) => ({ day, total })),
    });
  }),
);
app.use(express.static(path.join(__dirname, "static")));
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Ruta no encontrada" }),
);
app.use((err, req, res, next) => {
  if (err.code === 11000)
    return res.status(409).json({ error: "El nombre o registro ya existe" });
  console.error(err);
  res
    .status(err.status || 500)
    .json({ error: err.status ? err.message : "Error interno del servidor" });
});
async function seed() {
  if (!(await Employee.exists({}))) {
    for (const [name, username, password, role] of [
      ["Administrador demo", "admin", "Kikiriki2026!", "admin"],
      ["Operador demo", "empleado", "Empleado2026!", "empleado"],
    ])
      await Employee.create({
        id: await nextId("employees"),
        name,
        username,
        password: await bcrypt.hash(password, 12),
        role,
      });
  }
  if (!(await Product.exists({})))
    for (const [name, category, price, description, stock, emoji] of seeds)
      await Product.create({
        id: await nextId("products"),
        name,
        category,
        price,
        description,
        stock,
        emoji,
      });
  if (!(await Supply.exists({})))
    for (const [name, quantity, unit, minimum] of [
      ["Pollo crudo", 45, "unidad", 12],
      ["Papas", 30, "kg", 8],
      ["Arroz", 25, "kg", 5],
      ["Aceite", 18, "litro", 4],
      ["Bebidas", 60, "unidad", 15],
    ])
      await Supply.create({
        id: await nextId("supplies"),
        name,
        quantity,
        unit,
        minimum,
      });
}
(async () => {
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
    await seed();
    app.listen(port, () =>
      console.log(`Kikiriki MongoDB: http://localhost:${port}`),
    );
  } catch (e) {
    console.error("No se pudo iniciar. Verifica MongoDB y .env:", e.message);
    process.exit(1);
  }
})();
