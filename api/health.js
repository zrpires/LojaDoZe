import {endpoint} from '../lib/core.js';
import {KIND,NAME} from '../lib/config.js';
export default endpoint('GET',async()=>({ok:true,name:NAME,kind:KIND,mode:process.env.OPENAI_API_KEY?'openai':'local',authRequired:!!process.env.OPENAI_API_KEY,aiReady:!process.env.OPENAI_API_KEY||!!process.env.APP_PASSWORD,payments:KIND==='store'&&!!process.env.STRIPE_SECRET_KEY?'stripe':'demo'}));
