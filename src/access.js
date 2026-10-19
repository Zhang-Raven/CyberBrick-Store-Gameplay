import {createHmac,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const digest = value => createHash('sha256').update(value).digest();
const equals = (a,b) => timingSafeEqual(digest(a),digest(b));
export function createAccess(password='') {
  const key = password || randomBytes(32).toString('hex');
  const sign = value => createHmac('sha256',key).update(value).digest('base64url');
  return {
    required: Boolean(password),
    verifyPassword(value) { return typeof value==='string' && Boolean(password) && equals(value,password); },
    issue() { const payload=`${Date.now()+12*60*60*1000}.${randomBytes(18).toString('base64url')}`; return `${payload}.${sign(payload)}`; },
    authenticated(req) {
      if (!password) return true;
      const token=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('blessing_session='))?.slice('blessing_session='.length);
      if (!token || token.length>300) return false;
      const [expires,nonce,signature,...extra]=token.split('.');
      return !extra.length && Boolean(signature) && Number(expires)>Date.now() && equals(signature,sign(`${expires}.${nonce}`));
    },
  };
}
