import { KineticTextReveal } from "@/components/ui/kinetic-text-reveal";

/**
 * efferd's headline treatment: Outfit, a lighter first line with one
 * bold word, a heavier second line where the key phrase is foreground
 * and the rest is muted. Revealed word by word — once, on load.
 */
export function HeroTitle() {
  return (
    <h1 className="heading">
      <span className="block text-[clamp(1.6rem,3vw,2.25rem)] font-medium leading-[1.15] text-muted-foreground">
        <KineticTextReveal text="You build the" stagger={0.06} distance={14} className="inline" />{" "}
        <KineticTextReveal text="agent." stagger={0.06} distance={14} delay={0.2} className="inline font-bold text-foreground" />
      </span>
      <span className="block text-[clamp(2.2rem,4.4vw,3.25rem)] font-bold leading-[1.05] text-muted-foreground">
        <KineticTextReveal text="Intelligo is" stagger={0.06} distance={14} delay={0.3} className="inline" />{" "}
        <KineticTextReveal text="everything around it." stagger={0.06} distance={14} delay={0.42} className="inline text-foreground" />
      </span>
    </h1>
  );
}
