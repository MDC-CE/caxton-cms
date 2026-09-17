import { useState, useEffect, useMemo } from "react";
import { CSSMarquee } from "@/components/ui/CSSMarquee";
import { getIcon } from "@/lib/icons";
import { useInternalNav } from "@/hooks/useInternalNav";
import type { AiFlexSelectorDefault } from "@shared/schema";

// ─── Path matching (index-based, matching YAML option order) ──────────────────
// Q0 (goal):   0=productivity, 1=automate, 2=build,     3=data
// Q1 (coding): 0=none_no,      1=none_open, 2=some,     3=regular
// Q2 (impact): 0=reliable,     1=automations, 2=assistant, 3=code, 4=data_skills
// Q3 (use):    0=better,       1=add,       2=career_shift, 3=explore
function getPathName(answers: Record<number, number>): string {
  const q0 = answers[0];
  const q1 = answers[1];
  const q2 = answers[2];
  const q3 = answers[3];
  if (q0 === 3 || q2 === 4) return "The Data-Driven Analyst";
  if (q0 === 2 || (q1 === 3 && q3 === 2)) return "The Builder";
  if (q1 === 3 || q3 === 2) return "The Career Switcher";
  if (q0 === 1 || q2 === 1) return "The Automation Specialist";
  return "The AI-First Professional";
}

// ─── SkillBar ─────────────────────────────────────────────────────────────────
function SkillBar({ name, skill_percentage, animate }: { name: string; skill_percentage: number; animate: boolean }) {
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (animate) {
      const t = setTimeout(() => setWidth(skill_percentage), 60);
      return () => clearTimeout(t);
    } else {
      setWidth(0);
    }
  }, [animate, skill_percentage]);

  return (
    <div
      className="flex items-center gap-2 group/skill"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className="text-[11px] whitespace-nowrap overflow-hidden text-ellipsis transition-colors duration-150"
        style={{ minWidth: 120, color: hovered ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground) / 0.5)" }}
      >
        {name}
      </span>
      <div
        className="flex-1 rounded-full overflow-hidden transition-all duration-150"
        style={{ height: hovered ? 6 : 4, background: "hsl(var(--muted))" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: hovered ? "hsl(var(--primary) / 0.85)" : "hsl(var(--primary))",
            transitionProperty: "width, background",
            transitionDuration: "650ms, 180ms",
            transitionTimingFunction: "cubic-bezier(.4,0,.2,1)",
          }}
        />
      </div>
      <span
        className="text-[10px] tabular-nums transition-colors duration-150"
        style={{ minWidth: 26, textAlign: "right", color: hovered ? "hsl(var(--muted-foreground))" : "hsl(var(--muted-foreground) / 0.3)" }}
      >
        {skill_percentage}%
      </span>
    </div>
  );
}

// ─── CourseCard ───────────────────────────────────────────────────────────────
type Course = AiFlexSelectorDefault["courses"][0];

function CourseCard({
  course,
  isSelected,
  isRecommended,
  skillsLabel,
  onToggle,
}: {
  course: Course;
  isSelected: boolean;
  isRecommended: boolean;
  skillsLabel: string;
  onToggle: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  const [hovered, setHovered] = useState(false);

  const checkboxShadow = hovered
    ? isSelected
      ? "inset 0 0 0 1.8px hsl(var(--primary) / 0.7)"
      : "0 0 0 1.8px hsl(var(--border)), inset 0 0 0 1.8px hsl(var(--primary) / 0.18)"
    : isSelected
      ? "none"
      : "0 0 0 1.8px hsl(var(--border))";

  return (
    <div
      className="rounded-[13px] border-[1.5px] cursor-pointer select-none transition-all duration-200"
      style={{
        borderColor: isSelected ? "#0d6efd" : "hsl(var(--border))",
        background: isSelected ? "#f8fbff" : "hsl(var(--background))",
        opacity: isSelected ? 1 : 0.6,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 3px 10px rgba(0,0,0,0.03)",
        transition: "border-color .2s, box-shadow .2s, transform .18s, opacity .2s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.opacity = "1";
         el.style.boxShadow = "0 3px 10px rgba(13,110,253,0.08), 0 8px 22px rgba(13,110,253,0.05)";
        el.style.boxShadow = "0 3px 10px hsl(var(--primary) / 0.08), 0 8px 22px hsl(var(--primary) / 0.05)";
        el.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.opacity = isSelected ? "1" : "0.6";
        el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04), 0 3px 10px rgba(0,0,0,0.03)";
        el.style.transform = "none";
      }}
      onClick={() => onToggle(course.name)}
    >
      <div
        className="flex items-start gap-[10px] p-[13px] pb-[10px]"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className="w-5 h-5 rounded-full flex-shrink-0 mt-px flex items-center justify-center transition-all duration-150"
          style={{
            background: isSelected ? "hsl(var(--primary))" : "transparent",
            boxShadow: checkboxShadow,
          }}
        >
          <div
            className="w-[7px] h-[7px] rounded-full bg-background transition-all duration-200"
            style={{ opacity: isSelected ? 1 : 0, transform: isSelected ? "scale(1)" : "scale(0.4)" }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-[15px] font-bold leading-[1.3] mb-[2px]"
            style={{ color: !isSelected ? "hsl(var(--muted-foreground) / 0.6)" : "hsl(var(--foreground))" }}
          >
            {course.name}
          </div>
          <div className="text-[12px] leading-[1.4]" style={{ color: isSelected ? "hsl(var(--primary) / 0.6)" : "hsl(var(--muted-foreground) / 0.4)" }}>
            {course.tagline}
          </div>
        </div>
        <div
          className="text-[10px] px-[7px] py-[2px] rounded-full font-semibold whitespace-nowrap flex-shrink-0"
          style={{ color: "hsl(var(--muted-foreground) / 0.5)", background: "hsl(var(--muted))" }}
        >
          {course.hrs}
        </div>
      </div>

      <div
        className="flex items-center gap-[4px] px-[13px] pb-[10px] pt-[14px] mt-[-14px] cursor-pointer w-full origin-left"
        style={{
          transform: btnHovered ? "scale(1.06)" : "scale(1)",
          transition: "transform 150ms ease",
        }}
        onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
        onMouseEnter={() => setBtnHovered(true)}
        onMouseLeave={() => setBtnHovered(false)}
      >
        <span
          className="text-[11px] font-bold tracking-[0.07em] uppercase"
          style={{ color: "hsl(var(--primary))" }}
        >
          {skillsLabel}
        </span>
        <span
          className="text-[18px] leading-none transition-transform duration-200"
          style={{
            color: "hsl(var(--primary))",
            transform: expanded ? "rotate(180deg)" : "none",
            display: "inline-block",
          }}
        >
          ▾
        </span>
      </div>

      <div
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: expanded ? 160 : 0,
          borderTop: expanded ? "1px solid hsl(var(--border))" : "none",
        }}
        onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
      >
        <div className="px-[13px] pt-[10px] pb-[13px] flex flex-col gap-2">
          {course.skills.map((s) => (
            <SkillBar key={s.name} name={s.name} skill_percentage={s.skill_percentage} animate={expanded} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AiFlexSelectorDefault({ data }: { data: AiFlexSelectorDefault }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [animating, setAnimating] = useState(false);
  const [slideDir, setSlideDir] = useState<"none" | "exit-fwd" | "enter-fwd" | "exit-back" | "enter-back">("none");
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [counterFlash, setCounterFlash] = useState(false);
  const internalNav = useInternalNav();
  const nav = internalNav.navigate;

  const totalQ = data.questions.length;
  const isResults = step >= totalQ;
  const pathName = isResults ? getPathName(answers) : null;
  const currentPath = pathName
    ? (data.paths.find((p) => p.name === pathName) ?? data.paths[data.paths.length - 1])
    : null;

  useEffect(() => {
    if (isResults && currentPath) {
      setSelectedCourses(new Set(currentPath.courses));
    }
  }, [isResults, pathName]);

  // Tools: fixed from the path's recommended courses (not reactive to selection)
  const pathTools = useMemo(() => {
    if (!currentPath) return [];
    const seen = new Set<string>();
    const tools: string[] = [];
    currentPath.courses.forEach((cName) => {
      const course = data.courses.find((c) => c.name === cName);
      course?.tools?.forEach((t) => {
        if (!seen.has(t)) { seen.add(t); tools.push(t); }
      });
    });
    return tools;
  }, [currentPath, data.courses]);

  function pick(qIdx: number, optIdx: number) {
    if (animating) return;
    const newAnswers = { ...answers, [qIdx]: optIdx };
    setAnswers(newAnswers);
    setAnimating(true);
    setSlideDir("exit-fwd");
    setTimeout(() => {
      setStep((s) => s + 1);
      setSlideDir("enter-fwd");
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setSlideDir("none");
          setAnimating(false);
        })
      );
    }, 200);
  }

  function toggleCourse(name: string) {
    setSelectedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        if (next.size >= data.max_selections) {
          setCounterFlash(true);
          setTimeout(() => setCounterFlash(false), 800);
          return prev;
        }
        next.add(name);
      }
      return next;
    });
  }

  function goBack() {
    if (animating || step === 0) return;
    setAnimating(true);
    setSlideDir("exit-back");
    setTimeout(() => {
      setStep((s) => s - 1);
      setSlideDir("enter-back");
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setSlideDir("none");
          setAnimating(false);
        })
      );
    }, 200);
  }

  function restart() {
    if (animating) return;
    setAnimating(true);
    setSlideDir("exit-back");
    setTimeout(() => {
      setStep(0);
      setAnswers({});
      setSelectedCourses(new Set());
      setSlideDir("enter-back");
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setSlideDir("none");
          setAnimating(false);
        })
      );
    }, 200);
  }

  const slideStyle: React.CSSProperties =
    slideDir === "exit-fwd"
      ? { opacity: 0, transform: "translateX(-16px)", transition: "opacity .2s, transform .2s" }
      : slideDir === "enter-fwd"
      ? { opacity: 0, transform: "translateX(16px)" }
      : slideDir === "exit-back"
      ? { opacity: 0, transform: "translateX(16px)", transition: "opacity .2s, transform .2s" }
      : slideDir === "enter-back"
      ? { opacity: 0, transform: "translateX(-16px)" }
      : { opacity: 1, transform: "none", transition: "opacity .2s, transform .2s" };

  const toolBadgeStyle: React.CSSProperties = {
    fontFamily: "'SF Mono','Fira Code',monospace",
    fontSize: "15px",
    fontWeight: 600,
    color: "hsl(var(--muted-foreground))",
    background: "hsl(var(--background))",
    borderRadius: "9999px",
    padding: "7px 15px",
    whiteSpace: "nowrap",
    flexShrink: 0,
    cursor: "default",
    marginRight: 7,
  };

  const maskStyle: React.CSSProperties = {
    WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
    maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
  };

  const useTwoRows = pathTools.length > 8;
  const mid = Math.ceil(pathTools.length / 2);
  const row1 = useTwoRows ? pathTools.slice(0, mid) : pathTools;
  const row2 = useTwoRows ? pathTools.slice(mid) : [];

  const RobotIcon = data.icon ? getIcon(data.icon) : null;

  return (
    <div className="min-h-screen py-12 px-4 pb-16" style={{ fontFamily: "'Inter',system-ui,-apple-system,sans-serif" }}>
      <div className="mx-auto">

        {/* Badge */}
        <div
          className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase px-[13px] py-[5px] rounded-full mb-5"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          {data.badge_text}
        </div>

        {/* Title */}
        <h1 className="text-[36px] font-extrabold tracking-[-0.025em] leading-[1.1] mb-[0.6rem] font-inter" style={{ color: "hsl(var(--foreground))" }}>
          <span dangerouslySetInnerHTML={{ __html: data.title }} /><br />
          <span style={{ color: "hsl(var(--primary))" }} dangerouslySetInnerHTML={{ __html: data.title_highlight }} />
        </h1>
        <p className="text-[15px] leading-[1.6] mb-8" style={{ color: "hsl(var(--muted-foreground))" }}>
          {data.subtitle}
        </p>

        {/* Progress */}
        <div className="flex gap-[8px] mb-9">
          {data.questions.map((_, i) => (
            <div
              key={i}
              className="h-[2.2px] flex-1 rounded-full"
              style={{
                transition: "background .4s",
                background:
                  i < step
                    ? "hsl(var(--primary))"
                    : i === step && !isResults
                    ? "hsl(var(--primary) / 0.35)"
                    : "hsl(var(--secondary))",
              }}
            />
          ))}
        </div>

        {/* ── QUIZ ─────────────────────────────────────────────────────────── */}
        {!isResults && (
          <div style={slideStyle} className="relative mx-28">
            <div className="absolute" style={{ right: "calc(100% + 15px)", top: "-19px" }}>
              {RobotIcon && <RobotIcon width="85" height="85" style={{ color: "hsl(var(--foreground))" }} />}
            </div>
            <div className="text-[11px] font-bold tracking-[0.09em] uppercase mb-1" style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}>
              {data.questions[step].subtitle}
            </div>
            <div className="text-[20px] font-bold leading-[1.25] mb-6 tracking-[-0.01em]" style={{ color: "hsl(var(--foreground))" }}>
              {data.questions[step].text}
            </div>
            <div className="flex flex-col gap-2" key={step}>
              {data.questions[step].options.map((opt, optIdx) => {
                const sel = answers[step] === optIdx;
                return (
                  <button
                    key={optIdx}
                    className="flex items-center gap-[14px] px-4 py-[11px] border-[1.5px] rounded-[12px] cursor-pointer text-left w-full transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    style={{
                      borderColor: sel ? "hsl(var(--primary))" : "hsl(var(--border))",
                      background: sel ? "hsl(var(--primary) / 0.08)" : "hsl(var(--background))",
                    }}
                    onMouseEnter={(e) => {
                      if (!sel) {
                        e.currentTarget.style.borderColor = "hsl(var(--primary) / 0.4)";
                        e.currentTarget.style.background = "hsl(var(--primary) / 0.03)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!sel) {
                        e.currentTarget.style.borderColor = "hsl(var(--border))";
                        e.currentTarget.style.background = "hsl(var(--background))";
                        e.currentTarget.style.transform = "none";
                      }
                    }}
                    onClick={() => pick(step, optIdx)}
                  >
                    <div
                      className="w-5 h-5 rounded-full border-[1.5px] flex-shrink-0 flex items-center justify-center transition-all duration-200"
                      style={{
                        background: sel ? "hsl(var(--primary))" : "transparent",
                        borderColor: sel ? "hsl(var(--primary))" : "hsl(var(--border) / 0.8)",
                      }}
                    >
                      <div
                        className="w-[7px] h-[7px] rounded-full transition-all duration-200"
                        style={{
                          background: "hsl(var(--background))",
                          opacity: sel ? 1 : 0,
                          transform: sel ? "scale(1)" : "scale(0.4)",
                        }}
                      />
                    </div>
                    <span
                      className="text-[15px] flex-1 font-medium leading-[1.4]"
                      style={{ color: sel ? "hsl(var(--primary))" : "hsl(var(--foreground) / 0.7)" }}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {step > 0 && (
              <div className="w-full mt-4 flex justify-start">
                <button
                  className="text-[13px] font-medium bg-transparent border-none cursor-pointer flex items-center gap-1.5 transition-colors duration-150 px-0"
                  style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "hsl(var(--muted-foreground))"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "hsl(var(--muted-foreground) / 0.5)"; }}
                  onClick={goBack}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {data.back_label}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── RESULTS ──────────────────────────────────────────────────────── */}
        {isResults && currentPath && (
          <div style={slideStyle} className="relative mx-28">
            <div className="absolute" style={{ right: "calc(100% + 16px)", top: "-16px" }}>
              {RobotIcon && <RobotIcon width="85" height="85" style={{ color: "hsl(var(--foreground))" }} />}
            </div>

            <div className="text-[11px] font-bold tracking-[0.09em] uppercase" style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}>
              {data.results.ready_label}
            </div>
            <div className="text-[30px] font-bold tracking-[-0.03em] leading-[1.1] mb-[0.6rem]" style={{ color: "hsl(var(--foreground))" }}>
              {currentPath.name}
            </div>
            <div className="text-[13px] mb-6" style={{ color: "hsl(var(--muted-foreground) / 0.6)" }}>
              {currentPath.tagline}
            </div>

            {/* Counter row */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-[11px] font-bold tracking-[0.09em] uppercase" style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}>
                {data.results.subtitle}
              </div>
              <div
                className="text-[11px] font-bold px-[10px] py-[3px] rounded-full border transition-all duration-300"
                style={{
                  color: counterFlash ? "hsl(var(--destructive))" : "hsl(var(--primary))",
                  background: counterFlash ? "hsl(var(--destructive) / 0.08)" : "hsl(var(--primary) / 0.08)",
                  borderColor: counterFlash ? "hsl(var(--destructive) / 0.35)" : "hsl(var(--primary) / 0.25)",
                }}
              >
                {selectedCourses.size} / {data.max_selections} {data.results.counter_label}
              </div>
            </div>

            {/* Course grid */}
            <div className="grid grid-cols-2 gap-[9px] items-start">
              {[
                ...data.courses.filter((c) => currentPath.courses.includes(c.name)),
                ...data.courses.filter((c) => !currentPath.courses.includes(c.name)),
              ].map((course) => (
                <CourseCard
                  key={course.name}
                  course={course}
                  isSelected={selectedCourses.has(course.name)}
                  isRecommended={currentPath.courses.includes(course.name)}
                  skillsLabel={data.skills_breakdown_label}
                  onToggle={toggleCourse}
                />
              ))}
            </div>

            {/* Restart */}
            <button
              className="flex items-center gap-1.5 text-[12px] mt-3 underline cursor-pointer bg-transparent border-none transition-colors duration-150"
              style={{ color: "hsl(var(--muted-foreground) / 0.4)", fontFamily: "inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "hsl(var(--muted-foreground))"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "hsl(var(--muted-foreground) / 0.4)"; }}
              onClick={restart}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 10L4 6L8 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {data.restart_label}
            </button>

            {/* Tools */}
            <div className="mt-[27px]">
              <div className="text-[14px] font-bold tracking-[0.09em] uppercase mb-3 text-center" style={{ color: "hsl(var(--muted-foreground) / 0.4)" }}>
                {data.results.tools_label}
              </div>

              {!data.tools_marquee ? (
                <div className="flex flex-wrap gap-[7px] justify-center">
                  {pathTools.map((tool) => (
                    <span
                      key={tool}
                      style={toolBadgeStyle}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "hsl(var(--primary) / 0.1)";
                        e.currentTarget.style.color = "hsl(var(--primary))";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "hsl(var(--background))";
                        e.currentTarget.style.color = "hsl(var(--muted-foreground))";
                      }}
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-[5px]">
                  <div className="mx-[60px]">
                    <CSSMarquee direction="fwd" speed={80} maskStyle={maskStyle}>
                      {row1.map((item, i) => <span key={i} style={toolBadgeStyle}>{item}</span>)}
                    </CSSMarquee>
                  </div>
                  {useTwoRows && (
                    <CSSMarquee direction="rev" speed={80} maskStyle={maskStyle}>
                      {row2.map((item, i) => <span key={i} style={toolBadgeStyle}>{item}</span>)}
                    </CSSMarquee>
                  )}
                </div>
              )}
            </div>

            {/* CTA */}
            {data.cta.banner ? (
              <div
                className="rounded-[13px] px-[1.4rem] py-[1.2rem] flex items-center justify-between gap-4 mt-[35px]"
                style={{
                  background: "hsl(var(--primary))",
                  boxShadow: "0 4px 16px hsl(var(--primary) / 0.25)",
                }}
              >
                <div>
                  <div className="text-[15px] font-bold mb-[2px]" style={{ color: "hsl(var(--primary-foreground))" }}>
                    {data.cta.title}
                  </div>
                  <div className="text-[12px]" style={{ color: "hsl(var(--primary-foreground) / 0.6)" }}>
                    {data.cta.subtitle}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {data.cta.buttons.map((btn, i) => (
                    <button
                      key={i}
                      className="rounded-[8px] px-[18px] py-[10px] text-[13px] font-bold cursor-pointer whitespace-nowrap flex-shrink-0 transition-opacity duration-150 hover:opacity-90"
                      style={{ background: "hsl(var(--background))", color: "hsl(var(--primary))" }}
                      onClick={() => nav(btn.url)}
                    >
                      {btn.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 mt-[35px]">
                <div className="flex gap-2 flex-shrink-0">
                  {data.cta.buttons.map((btn, i) => (
                    <button
                      key={i}
                      className="rounded-[8px] px-[22px] py-[10px] text-[13px] font-bold cursor-pointer whitespace-nowrap flex-shrink-0 transition-opacity duration-150 hover:opacity-90"
                      style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                      onClick={() => nav(btn.url)}
                    >
                      {btn.text}
                    </button>
                  ))}
                </div>
                <div>
                  <div className="text-[15px] font-bold mb-[2px]" style={{ color: "hsl(var(--foreground))" }}>
                    {data.cta.title}
                  </div>
                  <div className="text-[12px]" style={{ color: "hsl(var(--muted-foreground) / 0.6)" }}>
                    {data.cta.subtitle}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
