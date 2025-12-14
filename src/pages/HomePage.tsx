import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BotMessageSquare, FileText, Zap, ShieldCheck, ArrowRight, Database, Settings, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import { motion } from 'framer-motion';
import type { CodingJob } from '@shared/types';
import { cn } from '@/lib/utils';
const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <Card className="text-center bg-card/50 backdrop-blur-sm floating-card">
    <CardHeader>
      <div className="mx-auto bg-primary/10 text-primary rounded-lg w-12 h-12 flex items-center justify-center mb-4">
        {icon}
      </div>
      <CardTitle className="text-xl font-semibold">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);
export function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const navigate = useNavigate();
  const handleAnalyze = async () => {
    if (!noteText.trim()) {
      toast.error('Please paste a clinical note to analyze.');
      return;
    }
    setIsAnalyzing(true);
    try {
      const response = await api<CodingJob>('/api/ingest-note', {
        method: 'POST',
        body: JSON.stringify({ clinical_note: noteText }),
      });
      toast.success("Note ingested successfully!", {
        description: "Redirecting to the Coding Workspace to see the results."
      });
      navigate('/coding-workspace', { state: { codingJob: response } });
    } catch (error) {
      toast.error("Failed to ingest note.", {
        description: error instanceof Error ? error.message : "An unknown error occurred."
      });
    } finally {
      setIsAnalyzing(false);
      setIsModalOpen(false);
    }
  };
  return (
    <div className="min-h-screen w-full bg-background text-foreground relative overflow-x-hidden scroll-snap">
      <ThemeToggle className="fixed top-4 right-4 z-50" />
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center absolute top-0 left-0 right-0 z-40">
        <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary" />
            <span className="text-lg font-bold font-display">BrainSAIT</span>
        </div>
        <nav className="hidden md:flex items-center gap-2">
            <Button variant="ghost" asChild><Link to="/dashboard">Dashboard</Link></Button>
            <Button variant="ghost" asChild><Link to="/claims-manager">Claims</Link></Button>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-8 md:py-10 lg:py-12">
          <section className="relative min-h-screen flex items-center justify-center text-center py-20 md:py-28 lg:py-32 scroll-snap-align-start snap-mandatory">
            <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#0E5FFF_1px,transparent_1px)] [background-size:32px_32px] opacity-20"></div>
            <div className="absolute inset-0 bg-gradient-primary/10 -z-10"></div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold text-balance leading-tight bg-clip-text text-transparent bg-gradient-primary">
                BrainSAIT DRG Suite
              </h1>
              <p className="text-xl md:text-2xl font-display text-foreground/90">
                Automated DRG & ICD Coding for Saudi Healthcare
              </p>
              <p className="max-w-3xl mx-auto text-lg text-muted-foreground text-pretty">
                Leverage our SOC2+ compliant AI to streamline clinical coding, automate nphies claim submissions, and enhance revenue cycle integrity with real-time CDI nudges.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
                <Button
                  size="lg"
                  onClick={() => setIsModalOpen(true)}
                  className="bg-gradient-primary text-white px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl hover:scale-105 hover:-translate-y-0.5 transition-all duration-200 min-h-[44px] active:scale-95"
                >
                  Ingest Note & Start Demo
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" asChild className="px-8 py-6 text-lg font-semibold hover:scale-105 transition-transform duration-200 min-h-[44px]">
                  <Link to="/dashboard">View Dashboard</Link>
                </Button>
              </div>
            </motion.div>
          </section>
          <section className="py-16 md:py-24 lg:py-32 scroll-snap-align-start snap-mandatory">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold font-display">A Complete Revenue Cycle Platform</h2>
              <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
                From clinical documentation to final payment reconciliation, all in one place.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-12">
              <FeatureCard icon={<Zap className="w-6 h-6" />} title="AI-Powered Coding" description="Automate ICD/DRG assignment with our three-phase engine: CAC, Semi-Autonomous, and Fully Autonomous." />
              <FeatureCard icon={<ArrowRight className="w-6 h-6" />} title="CDI 'Engage One' Nudges" description="Proactively prompt clinicians for greater specificity at the point of documentation, eliminating retrospective queries." />
              <FeatureCard icon={<ShieldCheck className="w-6 h-6" />} title="nphies Integration" description="Seamlessly submit claims, check statuses, and manage pre-authorizations with our secure, compliant connector." />
              <FeatureCard icon={<Database className="w-6 h-6" />} title="Claims Management" description="A centralized console to track, filter, and manage the entire lifecycle of your claims." />
              <FeatureCard icon={<Scale className="w-6 h-6" />} title="Audit & Reconciliation" description="Streamline payment posting and reconciliation with robust audit trails for SOC2 compliance." />
              <FeatureCard icon={<Settings className="w-6 h-6" />} title="SOC2+ Architecture" description="Built on a secure AWS backend with strict data controls, encryption, and monitoring." />
            </div>
          </section>
        </div>
      </main>
      <footer className="text-center py-8 border-t">
        <p className="text-muted-foreground">Built with ❤️ at Cloudflare</p>
      </footer>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">Ingest a Clinical Note</DialogTitle>
            <DialogDescription>
              Paste an unstructured clinical note below. The system will create a coding job and you'll be redirected to the Coding Workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="e.g., Patient presents with fever and cough. Chest X-ray confirms pneumonia..."
              className={cn("min-h-[200px] text-base", isAnalyzing && "shimmer-bg")}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              disabled={isAnalyzing}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isAnalyzing} className="min-h-[44px]">Cancel</Button>
            <Button type="submit" onClick={handleAnalyze} className="bg-[#0E5FFF] hover:bg-[#0E5FFF]/90 text-white min-h-[44px] active:scale-95" disabled={isAnalyzing}>
              {isAnalyzing ? 'Analyzing...' : 'Analyze Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Toaster richColors closeButton />
    </div>
  );
}