import React,{useEffect,useState} from 'react';
export default function PrinterSettings({locked,onChanged}) {
  const [config,setConfig]=useState({host:'',serial:'',model:'x2d',accessCodeConfigured:false});
  const [token,setToken]=useState('');
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState('');
  const [failed,setFailed]=useState(false);
  useEffect(()=>{fetch('/api/printer/config').then(r=>r.json()).then(d=>d.config&&setConfig(d.config)).catch(()=>{});},[]);
  async function save(event) {
    event.preventDefault();setWorking(true);setMessage('正在核对参数并连接打印机…');setFailed(false);
    try {
      const response=await fetch('/api/printer/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...config,token})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setConfig(data.config);setToken('');
      const test=await fetch('/api/printer/test',{method:'POST'});const result=await test.json();
      if(!test.ok)throw new Error(result.error);
      setMessage(result.message);setFailed(!result.connected);onChanged?.(result.printer);
    }catch(error){setFailed(true);setMessage(error.message);}finally{setWorking(false);}
  }
  return <section className="panel device-settings"><details open><summary>打印机连接参数 <span>X2D · 0.4 mm</span></summary><p className="muted">请从打印机「仅局域网」和「设备信息」页面填写。先开启仅局域网模式与开发者模式，再点击连接打印机。</p><form onSubmit={save}><div className="device-fields"><label>打印机 IP<input required placeholder="例如 192.168.1.100" value={config.host} disabled={locked||working} onChange={e=>setConfig({...config,host:e.target.value})}/></label><label>完整设备序列号 SN<input required minLength="10" maxLength="32" placeholder="设备信息页完整 SN" value={config.serial} disabled={locked||working} onChange={e=>setConfig({...config,serial:e.target.value})}/></label><label>局域网访问码<input type="password" autoComplete="off" maxLength="8" required={!config.accessCodeConfigured} placeholder={config.accessCodeConfigured?'已配置；留空则保留':'8 位访问码'} value={token} disabled={locked||working} onChange={e=>setToken(e.target.value)}/></label><label>打印机型号<select value={config.model} disabled><option value="x2d">Bambu Lab X2D</option></select></label></div><div className="config-actions"><p className="muted">切片：蓝 / 白 PLA，AMS 第 1 / 第 4 槽。访问码仅保存在本地服务电脑。</p><button className="secondary-button" disabled={locked||working} type="submit">{working?'正在测试连接…':'连接打印机'}</button></div>{message&&<p role="status" className={failed?'error':'config-success'}>{message}</p>}{locked&&<p className="muted">当前任务进行中，参数暂时锁定。</p>}</form></details></section>;
}
