import SolidCard from "@/components/SolidCard";
import UniversalImage from "@/components/UniversalImage";

interface CertificateProps {
  programName?: string;
  studentName?: string;
  useSolidCard?: boolean;
}

export function Certificate({ programName = "Full-Stack Developer", studentName = "Pedro Fuentes Escaloso de los Lobos", useSolidCard = false }: CertificateProps) {
  const logoImage = "4geeks-logo"
  const CertificateInner = (
    <div className="w-full aspect-[4/3]">
      <div 
        className="w-full h-full rounded-sm p-[3px]"
        style={{
          background: 'linear-gradient(90deg, #22c55e 0%, #06b6d4 15%, #3b82f6 30%, #f59e0b 50%, #ef4444 70%, #ec4899 85%, #22c55e 100%)'
        }}
      >
        <div className="w-full h-full bg-white rounded-[2px] relative overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <UniversalImage
              id={logoImage}
              alt="4Geeks"
              className="h-5 w-auto"
              style={{ objectFit: "contain" }}
            />
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center px-6 text-center relative pt-2">
            <h2 className="text-[11px] md:text-sm font-bold text-foreground tracking-[0.2em] uppercase mb-0">
              Certificate
            </h2>
            <p className="text-[8px] md:text-[10px] text-muted-foreground uppercase tracking-[0.15em] mb-1.5">
              of Achievement
            </p>
            
            <div className="flex items-center gap-1.5 mb-3">
              <svg className="w-3 h-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span className="text-[10px] md:text-xs font-bold text-foreground uppercase tracking-wide">
                {programName}
              </span>
              <svg className="w-3 h-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

            <p className="text-[7px] md:text-[9px] text-muted-foreground uppercase tracking-[0.1em] mb-1">
              This certificate is presented to
            </p>

            <h3 className="text-sm md:text-lg font-bold text-foreground mb-2">
              {studentName}
            </h3>

            <div className="w-14 h-14 md:w-16 md:h-16 opacity-[0.12] mt-auto mb-2">
              <svg viewBox="0 0 200 200" className="w-full h-full text-primary">
                <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="3" fill="none"/>
                {[...Array(20)].map((_, i) => {
                  const angle = (i * 360 / 20) * Math.PI / 180;
                  const x1 = 100 + 68 * Math.cos(angle);
                  const y1 = 100 + 68 * Math.sin(angle);
                  const x2 = 100 + 82 * Math.cos(angle);
                  const y2 = 100 + 82 * Math.sin(angle);
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>;
                })}
                <circle cx="100" cy="100" r="50" stroke="currentColor" strokeWidth="2" fill="none"/>
                <text x="100" y="80" fill="currentColor" fontSize="14" fontWeight="bold" textAnchor="middle">
                  4GEEKS
                </text>
                <g transform="translate(75, 88)">
                  <path d="M25 0c-4 0-8 2-10 4-2-1-5-2-8-2-7 0-12 5-12 12v10c0 2 2 4 4 4h36c2 0 4-2 4-4V14c0-7-5-12-12-12h-2z" 
                    fill="currentColor"/>
                  <rect x="4" y="10" width="15" height="11" rx="2" fill="white"/>
                  <rect x="30" y="10" width="15" height="11" rx="2" fill="white"/>
                  <rect x="19" y="13" width="11" height="3" fill="currentColor"/>
                </g>
                <text x="100" y="145" fill="currentColor" fontSize="8" fontWeight="bold" textAnchor="middle">
                  CODE WILL SET YOU FREE
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (useSolidCard) {
    return (
      <SolidCard className="p-0" data-testid="certificate-card-dynamic">
        {CertificateInner}
      </SolidCard>
    );
  }

  return (
    <div 
      className="relative w-full aspect-[4/3] rounded-card overflow-hidden shadow-card"
      data-testid="certificate-card-dynamic"
      style={{ backgroundColor: '#3b82f6' }}
    >
      <div className="absolute top-0 left-1/4 w-16 h-3 bg-cyan-400 z-0" />
      <div className="absolute top-0 left-1/2 w-20 h-3 bg-yellow-400 z-0" />
      <div className="absolute top-3 right-0 z-0">
        <div className="absolute top-0 right-0 w-8 h-16 bg-cyan-400 rounded-bl-full" />
        <div className="absolute top-12 right-0 w-12 h-20 bg-yellow-400 rounded-l-full" />
      </div>
      <div className="absolute bottom-0 right-0 z-0">
        <div className="absolute bottom-0 right-0 w-16 h-16 bg-blue-600" />
        <div className="absolute bottom-0 right-12 w-6 h-10 bg-orange-500" />
        <div className="absolute bottom-6 right-6 w-6 h-6 bg-red-500" />
      </div>
      <div className="absolute left-0 top-1/4 z-0">
        <div className="absolute left-0 top-0 w-4 h-12 bg-green-400 rounded-r-full" />
        <div className="absolute left-0 top-10 w-5 h-14 bg-blue-400 rounded-r-full" />
      </div>
      <div className="absolute bottom-0 left-0 z-0">
        <div className="absolute bottom-0 left-0 w-10 h-10 bg-red-500 rounded-tr-full" />
        <div className="absolute bottom-8 left-0 w-6 h-8 bg-blue-400" />
      </div>
      <div className="absolute top-4 left-4 right-4 bottom-4 z-[1]">
        <div 
          className="absolute inset-0 rounded-sm p-[3px]"
          style={{
            background: 'linear-gradient(90deg, #22c55e 0%, #06b6d4 15%, #3b82f6 30%, #f59e0b 50%, #ef4444 70%, #ec4899 85%, #22c55e 100%)'
          }}
        >
          <div className="w-full h-full bg-white rounded-[2px] relative overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3">
              <UniversalImage
                id={logoImage}
                alt="4Geeks"
                className="h-5 w-auto"
                style={{ objectFit: "contain" }}
              />
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center px-6 text-center relative pt-2">
              <h2 className="text-[11px] md:text-sm font-bold text-foreground tracking-[0.2em] uppercase mb-0">
                Certificate
              </h2>
              <p className="text-[8px] md:text-[10px] text-muted-foreground uppercase tracking-[0.15em] mb-1.5">
                of Achievement
              </p>
              
              <div className="flex items-center gap-1.5 mb-3">
                <svg className="w-3 h-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span className="text-[10px] md:text-xs font-bold text-foreground uppercase tracking-wide">
                  {programName}
                </span>
                <svg className="w-3 h-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              <p className="text-[7px] md:text-[9px] text-muted-foreground uppercase tracking-[0.1em] mb-1">
                This certificate is presented to
              </p>

              <h3 className="text-sm md:text-lg font-bold text-foreground mb-2">
                {studentName}
              </h3>

              <div className="w-14 h-14 md:w-16 md:h-16 opacity-[0.12] mt-auto mb-2">
                <svg viewBox="0 0 200 200" className="w-full h-full text-primary">
                  <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="3" fill="none"/>
                  {[...Array(20)].map((_, i) => {
                    const angle = (i * 360 / 20) * Math.PI / 180;
                    const x1 = 100 + 68 * Math.cos(angle);
                    const y1 = 100 + 68 * Math.sin(angle);
                    const x2 = 100 + 82 * Math.cos(angle);
                    const y2 = 100 + 82 * Math.sin(angle);
                    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>;
                  })}
                  <circle cx="100" cy="100" r="50" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <text x="100" y="80" fill="currentColor" fontSize="14" fontWeight="bold" textAnchor="middle">
                    4GEEKS
                  </text>
                  <g transform="translate(75, 88)">
                    <path d="M25 0c-4 0-8 2-10 4-2-1-5-2-8-2-7 0-12 5-12 12v10c0 2 2 4 4 4h36c2 0 4-2 4-4V14c0-7-5-12-12-12h-2z" 
                      fill="currentColor"/>
                    <rect x="4" y="10" width="15" height="11" rx="2" fill="white"/>
                    <rect x="30" y="10" width="15" height="11" rx="2" fill="white"/>
                    <rect x="19" y="13" width="11" height="3" fill="currentColor"/>
                  </g>
                  <text x="100" y="145" fill="currentColor" fontSize="8" fontWeight="bold" textAnchor="middle">
                    CODE WILL SET YOU FREE
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
