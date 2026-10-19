import React,{useEffect,useState} from 'react';
const draftKey='blessing-printer-draft';
function initialConfig(){
 const defaults={host:'',serial:'',model:'x2d',accessCodeConfigured:false};
 try{return {...defaults,...JSON.parse(localStorage.getItem(draftKey)||'{}'),accessCodeConfigured:false};}catch{return defaults;}
}
export default function PrinterSettings({locked,onChanged}) {
  const [config,setConfig]=useState(initialConfig);
  const [token,setToken]=useState('');
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState('');
  const [failed,setFailed]=useState(false);
  useEffect(()=>{fetch('/api/printer/config').then(r=>r.json()).then(d=>d.config?.serial&&setConfig(d.config)).catch(()=>{});},[]);
  async function save(event,test=false) {
    event.preventDefault();setMessage('');setFailed(false);
    try {
      localStorage.setItem(draftKey,JSON.stringify({host:config.host,serial:config.serial,model:config.model}));
      if(!test && (!config.serial || (!token && !config.accessCodeConfigured))){
        setMessage('IP / SN 草稿已保存在此浏览器。到现场后补全访问码，再点击测试连接。');return;
      }
      setWorking(true);
      const response=await fetch('/api/printer/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...config,token})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setConfig(data.config);setToken('');
      if(!test){setMessage('参数已保存。到现场连接同一局域网后，再点击测试连接。');return;}
      setMessage('正在测试局域网连接…');
      const check=await fetch('/api/printer/test',{method:'POST'});const result=await check.json();
      if(!check.ok)throw new Error(result.error);
      setMessage(result.message);setFailed(!result.connected);onChanged?.(result.printer);
    }catch(error){setFailed(true);setMessage(error.message);}finally{setWorking(false);}
  }
  return <section className="panel device-settings"><details open><summary>打印机连接参数 <span>X2D · 0.4 mm</span></summary><p className="muted">现在可先保存参数，无需打印机在线。到现场后，让本地服务电脑与打印机连接同一 Wi-Fi / 热点，再测试连接。</p><form onSubmit={save}><div className="device-fields"><label>打印机 IP<input required placeholder="例如 172.20.10.7" value={config.host} disabled={locked||working} onChange={e=>setConfig({...config,host:e.target.value})}/></label><label>完整设备序列号 SN<input maxLength="32" placeholder="设备信息页完整 SN，可稍后补全" value={config.serial} disabled={locked||working} onChange={e=>setConfig({...config,serial:e.target.value})}/></label><label>局域网访问码<input type="password" autoComplete="off" maxLength="8" placeholder={config.accessCodeConfigured?'已配置；留空则保留':'8 位访问码，可到现场填写'} value={token} disabled={locked||working} onChange={e=>setToken(e.target.value)}/></label><label>打印机型号<select value={config.model} disabled><option value="x2d">Bambu Lab X2D</option></select></label></div><div className="config-actions"><p className="muted">保存不会连接或打印。浏览器草稿只记 IP / SN，不保存访问码。</p><div className="config-buttons"><button className="secondary-button" disabled={locked||working} type="submit">保存参数</button><button className="secondary-button" disabled={locked||working} type="button" onClick={e=>save(e,true)}>{working?'处理中…':'测试连接'}</button></div></div>{message&&<p role="status" className={failed?'error':'config-success'}>{message}</p>}{locked&&<p className="muted">当前任务进行中，参数暂时锁定。</p>}</form></details></section>;
}
