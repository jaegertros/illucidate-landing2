const STORAGE_KEY = "illucidate_master_timeline";

let data = {items:[]};
let zoom = 3;

async function loadDefaults(){
  const response = await fetch("/data/master-timeline-default.json");
  const defaults = await response.json();
  
  const saved = localStorage.getItem(STORAGE_KEY);
  
  if(saved){
    data = JSON.parse(saved);
  }
  else{
    data = defaults;
  }
  
  render();
}

function saveLocal(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
}

function render(){
  const container = document.getElementById("timelineContainer");
  container.innerHTML="";
  
  data.items.sort((a,b)=>a.date.localeCompare(b.date));
  
  data.items.forEach((item,index)=>{
    const row=document.createElement("div");
    row.className="row";
    row.draggable=true;
    
    row.ondragstart=e=>{
      e.dataTransfer.setData("index",index);
    };
    
    row.ondrop=e=>{
      const from=e.dataTransfer.getData("index");
      const temp=data.items[from];
      data.items.splice(from,1);
      data.items.splice(index,0,temp);
      saveLocal();
      render();
    };
    
    row.ondragover=e=>e.preventDefault();
    
    const date=document.createElement("input");
    date.className="date";
    date.value=item.date||"";
    date.placeholder="YYYY-MM-DD or YYYY";
    
    date.oninput=()=>{
      data.items[index].date=date.value;
      saveLocal();
      renderTimeline();
    };
    
    const label=document.createElement("input");
    label.value=item.label||"";
    label.placeholder="Event description";
    
    label.oninput=()=>{
      data.items[index].label=label.value;
      saveLocal();
      renderTimeline();
    };
    
    const evidence=document.createElement("input");
    evidence.placeholder="Evidence link (optional)";
    evidence.value=item.evidence||"";
    
    evidence.oninput=()=>{
      data.items[index].evidence=evidence.value;
      saveLocal();
    };
    
    const remove=document.createElement("button");
    remove.textContent="X";
    
    remove.onclick=()=>{
      data.items.splice(index,1);
      saveLocal();
      render();
    };
    
    row.appendChild(date);
    row.appendChild(label);
    row.appendChild(evidence);
    row.appendChild(remove);
    
    container.appendChild(row);
  });
  
  renderTimeline();
}

function renderTimeline(){
  const container=document.getElementById("timelineVisual");
  container.innerHTML="";
  
  const years=data.items.map(i=>parseInt(i.date)).filter(v=>!isNaN(v));
  
  if(years.length===0)return;
  
  const min=Math.min(...years);
  const max=Math.max(...years);
  
  const range=(max-min)||1;
  
  data.items.forEach(item=>{
    const year=parseInt(item.date);
    if(isNaN(year))return;
    
    const pos=((year-min)/range)*100;
    
    const event=document.createElement("div");
    event.className="timeline-event";
    event.style.left=pos+"%";
    
    const dot=document.createElement("div");
    dot.className="timeline-dot";
    
    const label=document.createElement("div");
    label.className="timeline-label";
    
    if(item.evidence){
      const link=document.createElement("a");
      link.href=item.evidence;
      link.target="_blank";
      link.innerText=item.date+" "+item.label;
      label.appendChild(link);
    }else{
      label.innerHTML = `<div>${item.date}</div><div>${item.label}</div>`;
    }
    
    event.appendChild(dot);
    event.appendChild(label);
    
    container.appendChild(event);
  });
}

function exportPDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  let y = 20;
  
  doc.setFontSize(16);
  doc.text("Illucidate Master Timeline",20,y);
  
  y+=10;
  
  data.items
    .sort((a,b)=>a.date.localeCompare(b.date))
    .forEach(item=>{
      doc.setFontSize(12);
      doc.text(`${item.date}  -  ${item.label}`,20,y);
      
      if(item.evidence){
        doc.setTextColor(0,0,255);
        doc.textWithLink("Evidence",160,y,{url:item.evidence});
        doc.setTextColor(0,0,0);
      }
      
      y+=8;
      
      if(y > 280){
        doc.addPage();
        y = 20;
      }
    });
  
  doc.save("master-timeline.pdf");
}

function addItem(){
  data.items.push({date:"",label:"",evidence:""});
  saveLocal();
  render();
}

function resetDefault(){
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function exportJSON(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const link=document.createElement("a");
  link.href=URL.createObjectURL(blob);
  link.download="timeline.json";
  link.click();
}

document.getElementById("addRow").onclick=addItem;
document.getElementById("resetDefault").onclick=resetDefault;
document.getElementById("exportData").onclick=exportJSON;
document.getElementById("exportPDF").onclick=exportPDF;

document.getElementById("zoomSlider").oninput=e=>{
  zoom=e.target.value;
  renderTimeline();
};

loadDefaults();