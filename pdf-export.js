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
  function createReport({ period, sections, cards = [] }) {
    const pages=[]; let canvas,ctx,y;
    const green='#198c79', dark='#173c34', border='#c9ded7';
    const clean=value=>String(value).replaceAll('₽','руб.').replace(/[–—]/g,'-').replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'');
    const text=(value,x,top,size=22,bold=false,color=dark,align='left')=>{
      ctx.fillStyle=color;ctx.font=`${bold?'700':'400'} ${size}px Arial, sans-serif`;ctx.textAlign=align;
      ctx.fillText(clean(value),x,top);ctx.textAlign='left';
    };
    const box=(x,top,w,h,fill,stroke=border)=>{
      ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,top,w,h,10);else ctx.rect(x,top,w,h);
      ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();
    };
    const wrap=(value,width,size)=>{
      ctx.font=`${size}px Arial, sans-serif`;const words=clean(value).replace(/\s+/g,' ').split(' ');
      const lines=[];let line='';
      for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>width&&line){lines.push(line);line=word;}else line=next;}
      if(line)lines.push(line);return lines;
    };
    const page=(first=false)=>{
      if(canvas)pages.push(canvas);
      canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754);
      ctx.fillStyle='#eef8f5';ctx.fillRect(80,70,1080,134);ctx.fillStyle=green;ctx.fillRect(80,70,8,134);
      text('Отчет по выручке ресторанов',112,128,37,true);text(`За ${period}`,112,173,21,false,'#5d716b');
      y=250;
      if(first&&cards.length){
        const fills=['#edf8f4','#fff8ec','#f2f6fb'],accents=[green,'#e9a735','#537ca1'];
        cards.forEach((card,i)=>{
          const x=80+i*366;box(x,y,348,112,fills[i]);ctx.fillStyle=accents[i];ctx.fillRect(x,y+8,5,96);
          text(card[0],x+20,y+33,18,false,'#60736d');
          const value=clean(card[1]);let size=28;ctx.font=`700 ${size}px Arial`;
          while(ctx.measureText(value).width>308&&size>18){size--;ctx.font=`700 ${size}px Arial`;}
          text(value,x+20,y+78,size,true);
        });y+=155;
      }
    };
    page(true);
    for(const section of sections){
      if(section.title==='Итоги'&&cards.length)continue;
      const rows=section.rows||[];
      const columns=Math.max(1,rows[0]?.length||1);
      const widths=columns===1?[1048]:columns===2?[720,328]:[205,560,283];
      const starts=[96];for(let i=1;i<columns;i++)starts.push(starts[i-1]+widths[i-1]+16);
      const headers=section.headers||(columns===2?['Показатель','Значение']:columns===3?['Дата / период','Показатель','Значение']:['Показатель']);
      const tableHeader=()=>{
        text(section.title,80,y,27,true);y+=24;
        ctx.fillStyle=green;ctx.fillRect(80,y,1080,46);
        headers.forEach((label,i)=>text(label,i===columns-1&&columns>1?1144:starts[i],y+30,18,true,'#fff',i===columns-1&&columns>1?'right':'left'));
        y+=46;
      };
      if(y+130>1600)page();
      tableHeader();
      rows.forEach((row,index)=>{
        const cells=row.map((cell,i)=>wrap(cell,widths[i]-18,20));
        const height=Math.max(1,...cells.map(c=>c.length))*26+24;
        if(y+height>1600){page();tableHeader();}
        ctx.fillStyle=index%2?'#f7fbfa':'#eaf6f2';ctx.fillRect(80,y,1080,height);
        ctx.strokeStyle=border;ctx.lineWidth=1;ctx.strokeRect(80,y,1080,height);
        cells.forEach((lines,i)=>lines.forEach((line,n)=>text(line,i===columns-1&&columns>1?1144:starts[i],y+29+n*26,20,i===columns-1&&columns>1,dark,i===columns-1&&columns>1?'right':'left')));
        y+=height;
      });
      if(section.image){if(y+450>1600)page();ctx.drawImage(section.image,80,y+15,1080,420);y+=450;}
      y+=35;
    }
    pages.push(canvas);
    const images=pages.map((current,i)=>{
      canvas=current;ctx=canvas.getContext('2d');text(`Страница ${i+1} из ${pages.length}`,1160,1680,18,false,'#82909c','right');
      const data=atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]);return Uint8Array.from(data,c=>c.charCodeAt(0));
    });
    return pdfFromImages(images);
  }
  window.RevenuePDF={createReport,pdfFromImages};
})();
