let express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();
const { DATABASE_URL, SECRET_KEY, STRIPE_SECRET_KEY } = process.env;
const authenticateToken = require("./authMiddleware");

const stripe = require('stripe')(STRIPE_SECRET_KEY);

let app = express(); 
const corsOptions = {
  origin: ['https://57e1fe74-02a5-4657-b006-2b227766f34f-00-hxfn748x47r1.pike.replit.dev', 'http://localhost:5173'], 
  methods: 'GET,POST,PUT,DELETE', 
  allowedHeaders: 'Authorization,Content-Type',
};

app.use(cors(corsOptions))
app.use(express.json());
app.use("/cart", authenticateToken);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function getPostgresVersion() {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT version()");
    console.log(res.rows[0]);
  } finally {
    client.release();
  }
}
const YOUR_DOMAIN = process.env.NODE_ENV === 'production' 
? 'https://57e1fe74-02a5-4657-b006-2b227766f34f-00-hxfn748x47r1.pike.replit.dev'
: 'http://localhost:5173';

// POST FOR STRIPE

app.post('/create-checkout-session', async (req, res) => {
  const { items } = req.body;  

  const line_items = items.map(item => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: item.name,
         images: [item.image_url],
      },
      unit_amount: Math.round(item.price * 100),  
    },
    quantity: item.quantity,
  }));

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url: `${YOUR_DOMAIN}/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${YOUR_DOMAIN}`,
    });
     console.log('Session created successfully:', session)
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe session creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CHECKOUT SESSION FOR STRIPE

app.get('/retrieve-checkout-session/:session_id', async (req, res) => {
  const session_id = req.params.session_id;

  try {
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json(session);  // Send the session details to the frontend
  } catch (error) {
    console.error('Error retrieving session:', error);
    res.status(500).json({ error: error.message });
  }
});
//CREATE Add an item to user's cart

app.post("/cart", authenticateToken, async (req, res) => {
  const user_id = req.user.uid;
  const { product_variant_id, quantity } = req.body;

  const client = await pool.connect();
  try {
    const checkQuery = "SELECT * FROM cart WHERE user_id = $1 AND product_variant_id = $2";
    const checkValues = [user_id, product_variant_id];
    const checkResult = await client.query(checkQuery, checkValues);

    if (checkResult.rows.length > 0) {
      const updateQuery = "UPDATE cart SET quantity = quantity + $1 WHERE user_id = $2 AND product_variant_id = $3 RETURNING *";
      const updateValues = [quantity, user_id, product_variant_id];
      const updateResult = await client.query(updateQuery, updateValues);
      res.json(updateResult.rows[0]);
    } else {
     
      const insertQuery = "INSERT INTO cart (user_id, product_variant_id, quantity) VALUES ($1, $2, $3) RETURNING *";
      const insertValues = [user_id, product_variant_id, quantity];
      const insertResult = await client.query(insertQuery, insertValues);
      res.json(insertResult.rows[0]);
    }
  } catch (err) {
    console.log(err.stack);
    res.status(500).send("An error occurred, please try again.");
  } finally {
    client.release();
  }
});


//READ fetches all items in cart

app.get("/cart", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  const user_id = req.user.uid;
  try {
    const query = "SELECT * FROM cart WHERE user_id = $1";
    const result = await client.query(query, [user_id]);
    res.json(result.rows);
  } catch (err) {
    console.log(err.stack);
    res.status(500).send("An error occured");
  } finally {
    client.release();
  }
});

//UPDATE specific item in cart

app.put("/cart/:id", authenticateToken, async (req, res) => {
  const { quantity } = req.body;
  const { id } = req.params;
  const user_id = req.user.uid

  const client = await pool.connect();
  
  try {
     const query = 'UPDATE cart SET quantity = $1 WHERE user_id = $2 AND id = $3 RETURNING *';
    const values = [quantity, user_id, id];
    const result = await client.query(query, values);

    if (result.rowCount === 0) {
      res.status(404).json({ status: "fail", message: "Cart item not found" });
    } else {
      res.json({ status: "success", data: result.rows[0] });
    }
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// DELETE specifc item from a user's cart

app.delete("/cart/:product_variant_id", authenticateToken, async (req, res) => {
  const { product_variant_id } = req.params;
  const user_id = req.user.uid;
  const client = await pool.connect();

  try {
    
    const deleteQuery = "DELETE FROM cart WHERE user_id = $1 AND product_variant_id = $2 RETURNING *";
    const values = [user_id, product_variant_id];
    const result = await client.query(deleteQuery, values);

    if (result.rowCount === 0) {
      res.status(404).json({ status: "fail", message: "Item not found" });
    } else {
      res.json({ status: "success", message: "Item deleted successfully",
        data: {product_variant_id},       
      });
    }
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`App is listening on port ${PORT}`);
});


app.get("/", (req, res) => {
  res.json({ message: "Welcome to Viper Apparel Co. API" });
});


