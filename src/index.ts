import dotenv from 'dotenv';
import express, { Application, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { MongoClient, Db, ObjectId, ServerApiVersion } from 'mongodb';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors'
import { AddressInfo } from 'net';

dotenv.config();
const app: Application = express();
app.use(cors({
  origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://writingx-assignment-11.netlify.app'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 0;
const uri = `mongodb+srv://paymentUser:i1xGJeOE75Ymqwz4@cluster0.qmaxe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET as string;

const client = new MongoClient(uri as string, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
console.log('MongoDB URI:', uri);
if (!uri) {
  throw new Error('MongoDB URI is not defined');
}


console.log('MongoDB URI:', uri);

let db: Db;

// Cookie Options
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 3600 * 1000, // 1 hour
};

// User and Transaction Types
interface User {
  email: string;
  password: string;
  role?: string;
  credit?: number;
}

interface Transaction {
  user: string;
  amount: number;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: { email: string; role: string };
  }
}

// Middleware to Verify JWT
const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies?.token;
    if (!token) {
      res.status(401).send({ message: 'Unauthorized' });
      return;
    }
  
    jwt.verify(token, ACCESS_TOKEN_SECRET, (_error: any, _decoded: any) => {
      if (_error) {
        res.status(403).send({ message: 'Forbidden' });
        return;
      }
  
      // Ensure `decoded` matches the expected type
      if (typeof _decoded === 'object' && _decoded !== null) {
        req.user = _decoded as { email: string; role: string };
        next();
      } else {
        res.status(403).send({ message: 'Invalid token' });
      }
    });
  };
  

// Middleware to Verify Admin
const verifyAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = req.user?.email;
  
      if (!email) {
        res.status(401).send({ message: 'Unauthorized: No user email provided' });
        return
      }
  
      // Fetch the user from the database
      const user = await db.collection<User>('users').findOne({ email });
  
      if (!user || user.role !== 'admin') {
        res.status(403).send({ message: 'Forbidden Access: Admin-only action' });
        return
      }
  
      // User is an admin, proceed to the next middleware
      next();
    } catch (error) {
      console.error('Error in verifyAdmin middleware:', error);
      res.status(500).send({ message: 'Internal Server Error' });
    }
  };
  

// Main Function
const run = async () => {
  try {
   db = client.db('payment-webDB');

    console.log('Connected to MongoDB!');

    // Generate JWT Token
    app.post('/jwt', (req: Request, res: Response) => {
      const user = req.body;
      const token = jwt.sign(user, ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.cookie('token', token, cookieOptions).send({ success: true, token });
    });

    // Logout
    app.post('/logout', (req: Request, res: Response) => {
      res.clearCookie('token', cookieOptions).send({ success: true });
    });

    // Register New User
    app.post('/register', async (_req: Request, _res: Response) => {
      const { email, password, role } = _req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const user: User = { email, password: hashedPassword, role: role || 'user' };

      const existingUser = await db.collection<User>('users').findOne({ email });
      if (existingUser) {
        _res.status(400).send({ message: 'User already exists' });
        return 
      }

      await db.collection<User>('users').insertOne(user);
      _res.send({ message: 'User registered successfully' });
    });

    // Login
    app.post('/login', async (_req: Request, _res: Response) => {
        try {
          const { email, password } = _req.body;
      
          // Check if the email exists in the database
          const user = await db.collection<User>('users').findOne({ email });
          if (!user) {
            _res.status(404).send({ message: 'User not found' });
            return 
          }
      
          // Compare the provided password with the stored hashed password
          const isMatch = await bcrypt.compare(password, user.password);
          if (!isMatch) {
            _res.status(401).send({ message: 'Invalid credentials' });
            return 
          }
      
          // Generate a JWT token
          const token = jwt.sign(
            { email: user.email, role: user.role }, // Payload
            ACCESS_TOKEN_SECRET, // Secret key
            { expiresIn: '1h' } // Options
          );
      
          // Set the token as a secure HTTP-only cookie
          _res
            .cookie('token', token, cookieOptions)
            .send({ success: true, token });
        } catch (error) {
          console.error('Error during login:', error);
          _res.status(500).send({ message: 'Internal Server Error' });
        }
      });
      

    // Submit Transaction
    app.post('/transactions', verifyToken, async (req: Request, res: Response) => {
      const { amount, description } = req.body;
      const transaction: Transaction = {
        user: req.user!.email,
        amount,
        description,
        status: 'pending',
        createdAt: new Date(),
      };

      await db.collection<Transaction>('transactions').insertOne(transaction);
      res.send({ message: 'Transaction submitted successfully' });
    });

    // Get All Transactions (Admin Only)
    app.get('/transactions', verifyToken, verifyAdmin, async (_req: Request, res: Response) => {
      const transactions = await db.collection<Transaction>('transactions').find({}).toArray();
      res.send(transactions);
    });

    // Approve Transaction (Admin Only)
    app.patch('/transactions/approve/:id', verifyToken, verifyAdmin, async (_req: Request, _res: Response) => {
      const { id } = _req.params;

      const result = await db.collection<Transaction>('transactions').updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'approved' } }
      );

      if (result.modifiedCount === 0) {
         _res.status(404).send({ message: 'Transaction not found or already approved' });
         return
      }

      const transaction = await db.collection<Transaction>('transactions').findOne({ _id: new ObjectId(id) });
      if (transaction) {
        await db.collection<User>('users').updateOne(
          { email: transaction.user },
          { $inc: { credit: transaction.amount } }
        );
      }

      _res.send({ message: 'Transaction approved and user credit updated' });
    });

    // Reject Transaction (Admin Only)
    app.patch('/transactions/reject/:id', verifyToken, verifyAdmin, async (_req: Request, _res: Response) => {
      const { id } = _req.params;

      const result = await db.collection<Transaction>('transactions').updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'rejected' } }
      );

      if (result.modifiedCount === 0) {
        _res.status(404).send({ message: 'Transaction not found or already rejected' });
        return 
      }

      _res.send({ message: 'Transaction rejected' });
    });

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
  }
};

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Start Server
const server = app.listen(PORT, () => {
  const address = server.address() as AddressInfo;
  const actualPort = address.port;
  console.log(`Server running on port ${actualPort}`);
});