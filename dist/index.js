"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const mongodb_1 = require("mongodb");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const cors_1 = __importDefault(require("cors"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://writingx-assignment-11.netlify.app'
    ],
    credentials: true
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
const PORT = process.env.PORT || 0;
const uri = `mongodb+srv://paymentUser:i1xGJeOE75Ymqwz4@cluster0.qmaxe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const client = new mongodb_1.MongoClient(uri, {
    serverApi: {
        version: mongodb_1.ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
console.log('MongoDB URI:', uri);
if (!uri) {
    throw new Error('MongoDB URI is not defined');
}
console.log('MongoDB URI:', uri);
let db;
// Cookie Options
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600 * 1000, // 1 hour
};
// Middleware to Verify JWT
const verifyToken = (req, res, next) => {
    var _a;
    const token = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.token;
    if (!token) {
        res.status(401).send({ message: 'Unauthorized' });
        return;
    }
    jsonwebtoken_1.default.verify(token, ACCESS_TOKEN_SECRET, (_error, _decoded) => {
        if (_error) {
            res.status(403).send({ message: 'Forbidden' });
            return;
        }
        // Ensure `decoded` matches the expected type
        if (typeof _decoded === 'object' && _decoded !== null) {
            req.user = _decoded;
            next();
        }
        else {
            res.status(403).send({ message: 'Invalid token' });
        }
    });
};
// Middleware to Verify Admin
const verifyAdmin = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const email = (_a = req.user) === null || _a === void 0 ? void 0 : _a.email;
        if (!email) {
            res.status(401).send({ message: 'Unauthorized: No user email provided' });
            return;
        }
        // Fetch the user from the database
        const user = yield db.collection('users').findOne({ email });
        if (!user || user.role !== 'admin') {
            res.status(403).send({ message: 'Forbidden Access: Admin-only action' });
            return;
        }
        // User is an admin, proceed to the next middleware
        next();
    }
    catch (error) {
        console.error('Error in verifyAdmin middleware:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});
// Main Function
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        db = client.db('payment-webDB');
        console.log('Connected to MongoDB!');
        // Generate JWT Token
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jsonwebtoken_1.default.sign(user, ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.cookie('token', token, cookieOptions).send({ success: true, token });
        });
        // Logout
        app.post('/logout', (req, res) => {
            res.clearCookie('token', cookieOptions).send({ success: true });
        });
        // Register New User
        app.post('/register', (_req, _res) => __awaiter(void 0, void 0, void 0, function* () {
            const { email, password, role } = _req.body;
            const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
            const user = { email, password: hashedPassword, role: role || 'user' };
            const existingUser = yield db.collection('users').findOne({ email });
            if (existingUser) {
                _res.status(400).send({ message: 'User already exists' });
                return;
            }
            yield db.collection('users').insertOne(user);
            _res.send({ message: 'User registered successfully' });
        }));
        // Login
        app.post('/login', (_req, _res) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { email, password } = _req.body;
                // Check if the email exists in the database
                const user = yield db.collection('users').findOne({ email });
                if (!user) {
                    _res.status(404).send({ message: 'User not found' });
                    return;
                }
                // Compare the provided password with the stored hashed password
                const isMatch = yield bcryptjs_1.default.compare(password, user.password);
                if (!isMatch) {
                    _res.status(401).send({ message: 'Invalid credentials' });
                    return;
                }
                // Generate a JWT token
                const token = jsonwebtoken_1.default.sign({ email: user.email, role: user.role }, // Payload
                ACCESS_TOKEN_SECRET, // Secret key
                { expiresIn: '1h' } // Options
                );
                // Set the token as a secure HTTP-only cookie
                _res
                    .cookie('token', token, cookieOptions)
                    .send({ success: true, token });
            }
            catch (error) {
                console.error('Error during login:', error);
                _res.status(500).send({ message: 'Internal Server Error' });
            }
        }));
        // Submit Transaction
        app.post('/transactions', verifyToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
            const { amount, description } = req.body;
            const transaction = {
                user: req.user.email,
                amount,
                description,
                status: 'pending',
                createdAt: new Date(),
            };
            yield db.collection('transactions').insertOne(transaction);
            res.send({ message: 'Transaction submitted successfully' });
        }));
        // Get All Transactions (Admin Only)
        app.get('/transactions', verifyToken, verifyAdmin, (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
            const transactions = yield db.collection('transactions').find({}).toArray();
            res.send(transactions);
        }));
        // Approve Transaction (Admin Only)
        app.patch('/transactions/approve/:id', verifyToken, verifyAdmin, (_req, _res) => __awaiter(void 0, void 0, void 0, function* () {
            const { id } = _req.params;
            const result = yield db.collection('transactions').updateOne({ _id: new mongodb_1.ObjectId(id) }, { $set: { status: 'approved' } });
            if (result.modifiedCount === 0) {
                _res.status(404).send({ message: 'Transaction not found or already approved' });
                return;
            }
            const transaction = yield db.collection('transactions').findOne({ _id: new mongodb_1.ObjectId(id) });
            if (transaction) {
                yield db.collection('users').updateOne({ email: transaction.user }, { $inc: { credit: transaction.amount } });
            }
            _res.send({ message: 'Transaction approved and user credit updated' });
        }));
        // Reject Transaction (Admin Only)
        app.patch('/transactions/reject/:id', verifyToken, verifyAdmin, (_req, _res) => __awaiter(void 0, void 0, void 0, function* () {
            const { id } = _req.params;
            const result = yield db.collection('transactions').updateOne({ _id: new mongodb_1.ObjectId(id) }, { $set: { status: 'rejected' } });
            if (result.modifiedCount === 0) {
                _res.status(404).send({ message: 'Transaction not found or already rejected' });
                return;
            }
            _res.send({ message: 'Transaction rejected' });
        }));
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    }
    catch (err) {
        console.error('Failed to connect to MongoDB', err);
    }
});
run().catch(console.dir);
app.get('/', (req, res) => {
    res.send('API is running...');
});
// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
