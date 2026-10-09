(() => {
  const encoder = new TextEncoder();
  const ascii = (text) => encoder.encode(text);
  function pdfFromImages(images) {
    const chunks = []; const offsets = [0]; let length = 0;
    const push = (data) => { chunks.push(data); length += data.length; };
    const object = (id, parts) => { offsets[id] = length; push(ascii(`${id} 0 obj\n`)); parts.forEach(push); push(ascii('\nendobj\n')); };
    push(ascii('%PDF-1.4\n'));
    object(1, [ascii('<< /Type /Catalog /Pages 2 0 R >>')]);
    object(2, [ascii(`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`)]);
    images.forEach((image,i) => {
      const id=3+i*3; const stream=ascii('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q');
      object(id,[ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`)]);
      object(id+1,[ascii(`<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),image,ascii('\nendstream')]);
      object(id+2,[ascii(`<< /Length ${stream.length} >>\nstream\n`),stream,ascii('\nendstream')]);
    });
    const start=length;
    push(ascii(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`));
    const bytes = new Uint8Array(length); let position=0;
    chunks.forEach(chunk=>{ bytes.set(chunk,position); position+=chunk.length; });
    return new Blob([bytes], {type:'application/pdf'});
  }
  function createReport({ period, sections }) {
    const images=[]; let canvas,ctx,y;
    const clean=(value)=>String(value).replaceAll('₽','руб.').replace(/[–—]/g,'-').replace(/\p{Extended_Pictographic}/gu,'');
    const text=(value,x,top,size=24,bold=false)=>{ctx.fillStyle='#172a3a';ctx.font=`${bold?'700':'400'} ${size}px Arial, sans-serif`;ctx.fillText(clean(value),x,top);};
    const finish=()=>{
      text(`Выручка ресторанов · ${images.length+1}`,60,1700,18);
      const data=atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]);
      images.push(Uint8Array.from(data,c=>c.charCodeAt(0)));
    };
    const page=()=>{canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754);ctx.fillStyle='#e8f5ef';ctx.fillRect(60,50,1120,125);text('Выручка ресторанов',85,105,34,true);text(period,85,145,23);y=220;};
    const room=(height)=>{if(y+height>1630){finish();page();}};
    const wrap=(value,width,size)=>{ctx.font=`${size}px Arial, sans-serif`;const words=clean(value).replace(/\s+/g,' ').split(' ');const lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>width&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;};
    page();
    sections.forEach(section=>{
      room(90);text(section.title,60,y,28,true);y+=42;
      section.rows.forEach((row,index)=>{
        const widths=row.length===1?[1080]:row.length===2?[720,330]:[210,620,230];
        const cells=row.map((cell,i)=>wrap(cell,widths[i]||300,22));const height=Math.max(...cells.map(c=>c.length))*30+24;
        room(height);ctx.fillStyle=index%2?'#fff':'#f0f7f4';ctx.fillRect(60,y-22,1120,height);
        let x=75;cells.forEach((lines,i)=>{lines.forEach((line,n)=>text(line,x,y+n*30,22,i===row.length-1));x+=(widths[i]||300)+15;});y+=height;
      });
      if(section.image){room(480);ctx.drawImage(section.image,60,y,1120,440);y+=465;}
      y+=28;
    });finish();return pdfFromImages(images);
  }
  window.RevenuePDF={createReport,pdfFromImages};
})();
