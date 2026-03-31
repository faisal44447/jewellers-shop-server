require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require("jsonwebtoken");

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// ============================
// ✅ MIDDLEWARE
// ============================
app.use(cors({
    origin: ["http://localhost:5173"],
    credentials: true
}));
app.use(express.json());

// ============================
// ✅ TEST ROUTE
// ============================
app.get("/", (req, res) => {
    res.send("🚀 Server Running...");
});

// ============================
// ✅ MONGODB
// ============================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dios5i3.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
    serverApi: ServerApiVersion.v1
});

// ============================
// ✅ JWT
// ============================
app.post("/jwt", (req, res) => {
    const user = req.body;

    const token = jwt.sign(user, process.env.JWT_SECRET, {
        expiresIn: "7d"
    });

    res.send({ token });
});

// ============================
// 🚀 MAIN FUNCTION
// ============================
async function run() {
    try {
        await client.connect();
        console.log("✅ MongoDB Connected");

        const db = client.db("jewellersShop");

        const products = db.collection("products");
        const sales = db.collection("sales");
        const expenses = db.collection("expenses");
        const receivables = db.collection("receivables");
        const transactions = db.collection("transactions");
        const cashCollection = db.collection("cash");
        const carts = db.collection("carts"); // ✅ FIX

        // ============================
        // 🔐 VERIFY TOKEN
        // ============================
        const verifyToken = (req, res, next) => {
            const authHeader = req.headers.authorization;

            if (!authHeader) {
                return res.status(401).send({ message: "Unauthorized" });
            }

            const token = authHeader.split(" ")[1];

            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(403).send({ message: "Forbidden" });
                }

                req.user = decoded;
                next();
            });
        };

        // ============================
        // 📦 PRODUCTS
        // ============================
        app.post('/products', verifyToken, async (req, res) => {
            const p = req.body;

            const result = await products.insertOne({
                name: p.name,
                karat: p.karat,
                vori: Number(p.vori || 0),
                ana: Number(p.ana || 0),
                rati: Number(p.rati || 0),
                point: Number(p.point || 0),
                buyPrice: Number(p.buyPrice),
                sellPrice: 0,
                status: "stock",
                image: p.image || ""
            });

            res.send(result);
        });

        app.get('/products', verifyToken, async (req, res) => {
            try {
                const result = await products.find().toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to get products" });
            }
        });

        app.get('/products/:id', async (req, res) => {
            const result = await products.findOne({
                _id: new ObjectId(req.params.id)
            });
            res.send(result);
        });

        app.patch('/products/:id', async (req, res) => {
            const id = req.params.id;

            const updated = {
                ...req.body,
                vori: Number(req.body.vori || 0),
                ana: Number(req.body.ana || 0),
                rati: Number(req.body.rati || 0),
                point: Number(req.body.point || 0),
                buyPrice: Number(req.body.buyPrice || 0),
                sellPrice: Number(req.body.sellPrice || 0)
            };

            const result = await products.updateOne(
                { _id: new ObjectId(id) },
                { $set: updated }
            );

            res.send(result);
        });

        app.delete('/products/:id', verifyToken, async (req, res) => {
            const result = await products.deleteOne({
                _id: new ObjectId(req.params.id)
            });
            res.send(result);
        });

        // ============================
        // 🛒 CARTS (FIXED)
        // ============================
        app.get('/carts', async (req, res) => {
            const email = req.query.email;

            if (!email) {
                return res.status(400).send({ message: "Email required" });
            }

            const result = await carts.find({ email }).toArray();
            res.send(result);
        });

        // ============================
        // 💰 SALES
        // ============================
        app.get('/sales', async (req, res) => {
            const result = await sales.find().toArray();
            res.send(result);
        });

        app.post('/sell', async (req, res) => {
            const item = req.body;

            await sales.insertOne({
                ...item,
                total: item.sellPrice,
                profit: item.sellPrice - item.buyPrice,
                date: new Date()
            });

            await products.updateOne(
                { _id: new ObjectId(item._id) },
                {
                    $set: {
                        status: "sold",
                        sellPrice: item.sellPrice
                    }
                }
            );

            res.send({ success: true });
        });

        // ============================
        // 💸 EXPENSE
        // ============================
        app.post('/expenses', async (req, res) => {
            const result = await expenses.insertOne(req.body);
            res.send(result);
        });

        // ============================
        // 💵 RECEIVABLE
        // ============================
        app.post('/receivables', async (req, res) => {
            const result = await receivables.insertOne(req.body);
            res.send(result);
        });

        app.get('/receivables', async (req, res) => {
            const result = await receivables.find().toArray();
            res.send(result);
        });

        // ============================
        // 💳 TRANSACTIONS
        // ============================
        app.post('/transactions', async (req, res) => {
            const t = req.body;

            await transactions.insertOne(t);

            if (t.type === "loan") {
                await cashCollection.updateOne({}, { $inc: { amount: t.amount } }, { upsert: true });
            } else {
                await cashCollection.updateOne({}, { $inc: { amount: -t.amount } }, { upsert: true });
            }

            res.send({ success: true });
        });

        // ============================
        // 💰 CASH
        // ============================
        app.get('/cash', async (req, res) => {
            const cash = await cashCollection.findOne() || { amount: 0 };
            res.send(cash);
        });

        // ============================
        // 📊 DASHBOARD
        // ============================
        app.get('/dashboard', async (req, res) => {

            const p = await products.find().toArray();
            const s = await sales.find().toArray();
            const e = await expenses.find().toArray();
            const r = await receivables.find().toArray();
            const cash = await cashCollection.findOne() || { amount: 0 };
            const t = await transactions.find().toArray();

            const totalStock = p.length;
            const totalSales = s.reduce((sum, i) => sum + (i.total || 0), 0);
            const totalExpense = e.reduce((sum, i) => sum + (i.amount || 0), 0);
            const totalReceivable = r.reduce((sum, i) => sum + (i.amount || 0), 0);

            const totalLoan = t.filter(i => i.type === "loan")
                .reduce((sum, i) => sum + (i.amount || 0), 0);

            const totalGiven = t.filter(i => i.type === "given")
                .reduce((sum, i) => sum + (i.amount || 0), 0);

            res.send({
                totalStock,
                totalSales,
                totalExpense,
                totalReceivable,
                cash: cash.amount,
                profit: totalSales - totalExpense,
                takaPabo: totalReceivable,
                howladNise: totalLoan,
                howladDise: totalGiven,
                time: new Date()
            });
        });

    } catch (error) {
        console.log("❌ MongoDB Error:", error);
    }
}

run();

// ============================
// 🚀 SERVER START
// ============================
const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});