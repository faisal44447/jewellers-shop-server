const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const port = process.env.PORT || 5000;

// middleware
// example
const API_URL = "https://jewellers-shop-server.vercel.app";
app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://jewellers-shop-client.web.app",
        "https://your-vercel-url.vercel.app"
    ],
    credentials: true
}));
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dios5i3.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const db = client.db("jewellersShop");

        const products = db.collection("products");
        const sales = db.collection("sales");
        const expenses = db.collection("expenses");
        const receivables = db.collection("receivables");
        const transactions = db.collection("transactions");
        const cashCollection = db.collection("cash");
        const users = db.collection("users");
        const carts = db.collection("carts");

        // jwt related api

        // ============================
        // 🔐 VERIFY TOKEN
        // ============================
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "Unauthorized" });
            }

            const token = req.headers.authorization.split(" ")[1];

            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(403).send({ message: "Forbidden" });
                }
                req.user = decoded;
                next();
            });
        };

        // ============================
        // 🔑 JWT
        // ============================
        app.post('/jwt', (req, res) => {
            const user = req.body;

            const token = jwt.sign(
                { email: user.email }, // only necessary data
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            res.send({ token });
        });

        // ============================
        //  Admin
        // ============================
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.user.email) {
                return res.status(403).send({ message: "Forbidden" });
            }

            const user = await users.findOne({ email });

            res.send({ admin: user?.role === 'admin' });
        });

        // ============================
        // 👤 USERS
        // ============================
        app.post('/users', async (req, res) => {
            const user = req.body;

            const existing = await users.findOne({ email: user.email });

            if (existing) {
                return res.send({ message: "User already exists" });
            }

            const result = await users.insertOne(user);
            res.send({ success: true, result });
        });

        // ============================
        // 📦 PRODUCTS
        // ============================
        app.post('/products', async (req, res) => {
            const p = req.body;

            const result = await products.insertOne({
                name: p.name,
                karat: p.karat,
                vori: Number(p.vori || 0),
                ana: Number(p.ana || 0),
                rati: Number(p.rati || 0),
                point: Number(p.point || 0),
                buyPrice: Number(p.buyPrice || 0),
                sellPrice: 0,
                status: "stock",
                image: p.image || "",
                createdAt: new Date()
            });

            res.send({ success: true, result });
        });

        app.get('/products', verifyToken, async (req, res) => {
            try {
                const result = await products
                    .find()
                    .sort({ createdAt: -1 }) // optional but better
                    .toArray();

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Server error" });
            }
        });

        app.get('/products/:id', async (req, res) => {
            const product = await products.findOne({
                _id: new ObjectId(req.params.id)
            });
              console.log("API HIT");

            if (!product) {
                return res.status(404).send({ message: "Product not found" });
            }

            res.send(product);
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

            if (result.matchedCount === 0) {
                return res.status(404).send({ message: "Product not found" });
            }

            res.send({ success: true });
        });

        app.delete('/products/:id', async (req, res) => {
            const result = await products.deleteOne({
                _id: new ObjectId(req.params.id)
            });

            if (result.deletedCount === 0) {
                return res.status(404).send({ message: "Product not found" });
            }

            res.send({ message: "Deleted successfully" });
        });

        // ============================
        // 🛒 CARTS
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
            try {
                const item = req.body;

                // ✅ ID validation আগে করো
                if (!ObjectId.isValid(item._id)) {
                    return res.status(400).send({ message: "Invalid ID" });
                }

                // ✅ sale insert
                await sales.insertOne({
                    ...item,
                    total: Number(item.sellPrice || 0),
                    profit: Number(item.sellPrice || 0) - Number(item.buyPrice || 0),
                    date: new Date()
                });

                // ✅ product update
                await products.updateOne(
                    { _id: new ObjectId(item._id) },
                    {
                        $set: {
                            status: "sold",
                            sellPrice: Number(item.sellPrice || 0)
                        }
                    }
                );

                res.send({ success: true });

            } catch (error) {
                res.status(500).send({ message: "Server error" });
            }
        });

        app.delete("/sales/:id", async (req, res) => {
            const id = req.params.id;

            const result = await sales.deleteOne({
                _id: new ObjectId(id)
            });

            res.send(result);
        });

        // ============================
        // 💸 EXPENSE
        // ============================
        app.post("/expenses", async (req, res) => {
            const data = req.body;

            const result = await db.collection("expenses").insertOne({
                ...data,
                createdAt: new Date()
            });

            res.send(result);
        });

        app.get("/expenses", async (req, res) => {
            const result = await db.collection("expenses")
                .find()
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        });

        app.patch("/expenses/:id", async (req, res) => {
            const id = req.params.id;
            const updated = req.body;

            const result = await db.collection("expenses").updateOne(
                { _id: new ObjectId(id) },
                { $set: updated }
            );

            res.send(result);
        });

        app.delete("/expenses/:id", async (req, res) => {
            const id = req.params.id;
            const result = await db.collection("expenses").deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // ============================
        // 💵 RECEIVABLE
        // ============================
        app.post('/receivables', async (req, res) => {
            const data = req.body;

            const result = await receivables.insertOne({
                ...data,
                createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
            });

            res.send(result);
        });

        app.get('/receivables', async (req, res) => {
            const result = await receivables.find().sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        // ❌ DELETE RECEIVABLE
        app.delete("/receivables/:id", async (req, res) => {
            const id = req.params.id;

            const result = await receivables.deleteOne({
                _id: new ObjectId(id)
            });

            res.send(result);
        });

        // ✏️ UPDATE RECEIVABLE
        app.patch("/receivables/:id", async (req, res) => {
            const id = req.params.id;
            const data = req.body;

            const result = await receivables.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        name: data.name,
                        amount: Number(data.amount),
                        createdAt: new Date()
                    }
                }
            );

            res.send(result);
        });

        // ============================
        // 💳 TRANSACTIONS
        // ============================

        app.get("/transactions", async (req, res) => {
            const result = await db.collection("transactions")
                .find()
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        });

        app.post("/transactions", async (req, res) => {
            const data = req.body;
            const result = await db.collection("transactions").insertOne({
                ...data,
                createdAt: new Date()
            });
            res.send(result);
        });

        app.delete("/transactions/:id", async (req, res) => {
            const id = req.params.id;
            const result = await db.collection("transactions").deleteOne({ _id: new ObjectId(id) });
            res.send(result);
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

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('laivin is sitting')
})

app.listen(port, () => {
    console.log(`Laivin boss is sitting on port ${port}`);
})

/**
 * --------------------------------
 *      NAMING CONVENTION
 * --------------------------------
 * app.get('/users')
 * app.get('/users/:id')
 * app.post('/users')
 * app.put('/users/:id')
 * app.patch('/users/:id')
 * app.delete('/users/:id')
 * 
*/