import {endpoint} from '../lib/core.js';
import {PRODUCTS} from '../lib/config.js';
export default endpoint('GET',async()=>({products:PRODUCTS,payments:process.env.STRIPE_SECRET_KEY?'stripe':'demo'}));
