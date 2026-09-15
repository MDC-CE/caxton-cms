import { useState } from "react";
import { Filter, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { getDebugToken } from "@/hooks/useDebugAuth";
import { useEditModeOptional } from "@/contexts/EditModeContext";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { inlineMarkdownToHtml } from "@/lib/inline-markdown";

const AVAILABLE_FEATURES = [
  "online-platform",
  "mentors-and-teachers",
  "price",
  "career-support",
  "content-and-syllabus",
  "job-guarantee",
  "full-stack",
  "cybersecurity",
  "data-science",
  "applied-ai",
  "ai-engineering",
  "outcomes",
  "scholarships",
  "rigobot",
  "learnpack",
  "certification",
] as const;

const AVAILABLE_LOCATIONS = [
  "all",
  "atlanta-usa",
  "austin-usa",
  "barcelona-spain",
  "berlin-germany",
  "bogota-colombia",
  "buenosaires-argentina",
  "caracas-venezuela",
  "chicago-usa",
  "costa-rica",
  "dallas-usa",
  "dublin-ireland",
  "hamburg-germany",
  "houston-usa",
  "lapaz-bolivia",
  "lima-peru",
  "lisbon-portugal",
  "losangeles-usa",
  "madrid-spain",
  "malaga-spain",
  "mexicocity-mexico",
  "miami-usa",
  "milan-italy",
  "montevideo-uruguay",
  "munich-germany",
  "newyork-usa",
  "orlando-usa",
  "panamacity-panama",
  "quito-ecuador",
  "rome-italy",
  "santiago-chile",
  "tampa-usa",
  "toronto-canada",
  "valencia-spain",
] as const;

const MAX_FEATURES = 2;

const DB_NAME = "frequently_asked_questions";

interface FaqItem {
  locale?: string;
  question: string;
  answer: string;
  locations?: string[];
  related_features?: string[];
  last_updated?: string;
  priority?: number;
}

interface FaqEditorProps {
  data?: {
    title?: string;
    subtitle?: string;
  };
}

export function FaqEditor({ data }: FaqEditorProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language?.startsWith("es") ? "es" : "en";
  const editMode = useEditModeOptional();
  const isEditMode = editMode?.isEditMode ?? false;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterFeature, setFilterFeature] = useState<string>("all");
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const QUERY_KEY = [`/api/databases/${DB_NAME}/items`];

  const { data: faqsData, isLoading, error } = useQuery<{ items: FaqItem[] }>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const token = getDebugToken();
      const res = await fetch(`/api/databases/${DB_NAME}/items`, {
        headers: token ? { "X-Debug-Token": token } : {},
      });
      if (!res.ok) throw new Error("Failed to load FAQs");
      return res.json();
    },
  });

  const allFaqs = faqsData?.items ?? [];
  const faqs = allFaqs.filter(f => f.locale === locale);

  const addMutation = useMutation({
    mutationFn: async (faq: FaqItem) => {
      const token = getDebugToken();
      const res = await fetch(`/api/databases/${DB_NAME}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Debug-Token": token } : {}),
        },
        body: JSON.stringify({ item: { ...faq, locale } }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add FAQ");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "FAQ added", description: "New FAQ has been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ index, faq }: { index: number; faq: FaqItem }) => {
      const token = getDebugToken();
      const res = await fetch(`/api/databases/${DB_NAME}/items/${index}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Debug-Token": token } : {}),
        },
        body: JSON.stringify(faq),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update FAQ");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "FAQ updated", description: "Changes have been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (index: number) => {
      const token = getDebugToken();
      const res = await fetch(`/api/databases/${DB_NAME}/items/${index}`, {
        method: "DELETE",
        headers: token ? { "X-Debug-Token": token } : {},
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete FAQ");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "FAQ deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isMutating = addMutation.isPending || editMutation.isPending || deleteMutation.isPending;

  const filteredFaqs = faqs.filter((faq) => {
    const matchesSearch =
      searchTerm === "" ||
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFeature =
      filterFeature === "all" ||
      (faq.related_features && faq.related_features.includes(filterFeature));

    return matchesSearch && matchesFeature;
  });

  const handleAddFaq = () => {
    setEditingFaq({
      question: "",
      answer: "",
      locations: ["all"],
      related_features: [],
      last_updated: new Date().toISOString().split("T")[0],
      priority: 1,
    });
    setEditingIndex(null);
    setIsDialogOpen(true);
  };

  const handleEditFaq = (faq: FaqItem) => {
    const globalIndex = allFaqs.indexOf(faq);
    setEditingFaq({ ...faq });
    setEditingIndex(globalIndex);
    setIsDialogOpen(true);
  };

  const handleDeleteFaq = (faq: FaqItem) => {
    const globalIndex = allFaqs.indexOf(faq);
    if (globalIndex === -1) return;
    deleteMutation.mutate(globalIndex);
  };

  const handleSaveFaq = () => {
    if (!editingFaq) return;

    const updatedFaq = {
      ...editingFaq,
      last_updated: new Date().toISOString().split("T")[0],
    };

    if (editingIndex !== null) {
      editMutation.mutate({ index: editingIndex, faq: updatedFaq });
    } else {
      addMutation.mutate(updatedFaq);
    }

    setIsDialogOpen(false);
    setEditingFaq(null);
    setEditingIndex(null);
  };

  const toggleFeature = (feature: string) => {
    if (!editingFaq) return;
    const features = editingFaq.related_features || [];
    if (features.includes(feature)) {
      setEditingFaq({ ...editingFaq, related_features: features.filter((f) => f !== feature) });
    } else if (features.length < MAX_FEATURES) {
      setEditingFaq({ ...editingFaq, related_features: [...features, feature] });
    } else {
      toast({ title: "Maximum reached", description: `You can select up to ${MAX_FEATURES} related features.`, variant: "destructive" });
    }
  };

  const toggleLocation = (location: string) => {
    if (!editingFaq) return;
    const locations = editingFaq.locations || ["all"];
    if (location === "all") {
      setEditingFaq({ ...editingFaq, locations: ["all"] });
    } else if (locations.includes(location)) {
      const newLocations = locations.filter((l) => l !== location);
      setEditingFaq({ ...editingFaq, locations: newLocations.length ? newLocations : ["all"] });
    } else {
      const newLocations = locations.filter((l) => l !== "all");
      setEditingFaq({ ...editingFaq, locations: [...newLocations, location] });
    }
  };

  const groupedFaqs = faqs.reduce((groups, faq) => {
    const features = faq.related_features?.length ? faq.related_features : ["general"];
    features.forEach((feature) => {
      if (!groups[feature]) {
        groups[feature] = [];
      }
      groups[feature].push(faq);
    });
    return groups;
  }, {} as Record<string, FaqItem[]>);

  const formatFeatureName = (feature: string) => {
    return feature
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (!isEditMode) {
    return (
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-8" data-testid="text-faq-editor-title">
            {data?.title || "Frequently Asked Questions"}
          </h2>
          <p className="text-muted-foreground text-center mb-8">
            {data?.subtitle || "Do you have any questions? We may have already answered it in this section."}
          </p>
          <div className="space-y-8">
            {Object.entries(groupedFaqs).map(([feature, faqList]) => (
              <div key={feature}>
                <h3 className="text-lg font-semibold text-center mb-4" data-testid={`text-faq-group-${feature}`}>
                  Frequently Asked Questions about {formatFeatureName(feature)}
                </h3>
                <Accordion type="single" collapsible className="bg-card rounded-lg border">
                  {faqList.map((faq, index) => (
                    <AccordionItem
                      key={`${feature}-${index}`}
                      value={`${feature}-item-${index}`}
                      className="border-0 border-b last:border-b-0 px-6"
                    >
                      <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground pb-4">
                        <RichTextContent
                          html={inlineMarkdownToHtml(faq.answer)}
                          className="text-muted-foreground"
                        />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 bg-muted rounded mx-auto" />
            <div className="h-12 bg-muted rounded" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-destructive">Failed to load FAQs. Please try again.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12" data-testid="section-faq-editor">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-3xl font-bold" data-testid="text-faq-editor-title">
                {data?.title || "FAQ Editor"}
              </h2>
              <p className="text-muted-foreground">
                {data?.subtitle || `Managing ${faqs.length} FAQs (${locale.toUpperCase()})`}
              </p>
            </div>
            <Button onClick={handleAddFaq} data-testid="button-add-faq">
              <Plus className="w-4 h-4 mr-2" />
              Add FAQ
            </Button>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search FAQs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-faqs"
              />
            </div>
            <Select value={filterFeature} onValueChange={setFilterFeature}>
              <SelectTrigger className="w-full md:w-[200px]" data-testid="select-filter-feature">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by feature" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Features</SelectItem>
                {AVAILABLE_FEATURES.map((feature) => (
                  <SelectItem key={feature} value={feature}>
                    {feature.replace(/-/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {filteredFaqs.map((faq) => {
              const globalIndex = allFaqs.indexOf(faq);
              return (
                <Card key={globalIndex} className="p-4" data-testid={`card-faq-${globalIndex}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground mb-1 truncate">{faq.question}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{faq.answer}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {faq.related_features?.map((feature) => (
                          <Badge key={feature} variant="secondary" className="text-xs">
                            {feature}
                          </Badge>
                        ))}
                        {faq.priority && (
                          <Badge variant="outline" className="text-xs">
                            Priority: {faq.priority}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEditFaq(faq)}
                        data-testid={`button-edit-faq-${globalIndex}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteFaq(faq)}
                        disabled={isMutating}
                        data-testid={`button-delete-faq-${globalIndex}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {filteredFaqs.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {searchTerm || filterFeature !== "all"
                ? "No FAQs match your search criteria."
                : "No FAQs yet. Click 'Add FAQ' to create one."}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingIndex !== null ? "Edit FAQ" : "Add New FAQ"}</DialogTitle>
          </DialogHeader>

          {editingFaq && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Question</label>
                <Input
                  value={editingFaq.question}
                  onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })}
                  placeholder="Enter the question..."
                  data-testid="input-faq-question"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Answer</label>
                <Textarea
                  value={editingFaq.answer}
                  onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })}
                  placeholder="Enter the answer..."
                  rows={6}
                  data-testid="input-faq-answer"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Priority</label>
                <Select
                  value={String(editingFaq.priority || 1)}
                  onValueChange={(v) => setEditingFaq({ ...editingFaq, priority: parseInt(v) })}
                >
                  <SelectTrigger data-testid="select-faq-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - High</SelectItem>
                    <SelectItem value="2">2 - Medium</SelectItem>
                    <SelectItem value="3">3 - Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Related Features <span className="text-muted-foreground font-normal">(max {MAX_FEATURES})</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_FEATURES.map((feature) => {
                    const isSelected = editingFaq.related_features?.includes(feature);
                    const isDisabled = !isSelected && (editingFaq.related_features?.length || 0) >= MAX_FEATURES;
                    return (
                      <Badge
                        key={feature}
                        variant={isSelected ? "default" : "outline"}
                        className={`cursor-pointer ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                        onClick={() => !isDisabled && toggleFeature(feature)}
                        data-testid={`badge-feature-${feature}`}
                      >
                        {feature.replace(/-/g, " ")}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Locations <span className="text-muted-foreground font-normal">(select "all" for global, or pick specific locations)</span>
                </label>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                  {AVAILABLE_LOCATIONS.map((location) => {
                    const isSelected = editingFaq.locations?.includes(location) ||
                      (location === "all" && (!editingFaq.locations || editingFaq.locations.length === 0));
                    return (
                      <Badge
                        key={location}
                        variant={isSelected ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleLocation(location)}
                        data-testid={`badge-location-${location}`}
                      >
                        {location === "all" ? "All (default)" : location.replace(/-/g, " ")}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel-faq">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSaveFaq}
              disabled={!editingFaq?.question || !editingFaq?.answer || isMutating}
              data-testid="button-save-faq"
            >
              <Save className="w-4 h-4 mr-2" />
              {isMutating ? "Saving..." : "Save FAQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default FaqEditor;
