import { lazy, Suspense } from "react";
import type { ContactUsInfoSection, ContactLocation } from "@shared/schema";
import { Mail, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { sectionBackgroundStyle } from "@shared/theme-palette";

const LeadForm = lazy(() => import("@/components/lead_form/variants/LeadFormDefault"));

function LeadFormFallback() {
  return (
    <div className="min-h-24 flex items-center justify-center text-muted-foreground text-sm">
      Loading...
    </div>
  );
}

interface ContactUsInfoProps {
  data: ContactUsInfoSection;
}

function LocationCard({ location }: { location: ContactLocation }) {
  return (
    <div
      className="flex gap-4 py-2 borde border-border last:border-b-0 w-full lg:max-w-72"
      data-testid={`card-location-${location.code.toLowerCase()}`}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center">
          <span
            className="font-semibold text-foreground"
            data-testid={`text-location-name-${location.code.toLowerCase()}`}
          >
            {location.name}
          </span>
          <Badge
            variant="outline"
            className="shrink-0 h-8 w-8 rounded-md flex border-none items-center justify-center text-xs font-bold no-default-hover-elevate no-default-active-elevate"
            data-testid={`badge-country-${location.code.toLowerCase()}`}
          >
            {location.code}
          </Badge>
        </div>

        {location.address && (
          <span className="text-sm text-muted-foreground flex items-start gap-1.5">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
            <span
              data-testid={`text-location-address-${location.code.toLowerCase()}`}
            >
              {location.address}
            </span>
          </span>
        )}
        {location.phone && (
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Phone className="w-4 h-4 shrink-0" />
            <a
              href={`tel:${location.phone.replace(/[^\d+]/g, "")}`}
              className="hover:text-foreground transition-colors"
              data-testid={`link-location-phone-${location.code.toLowerCase()}`}
            >
              P: {location.phone}
            </a>
          </span>
        )}
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Mail className="w-4 h-4 shrink-0" />
          <a
            href={`mailto:${location.email}`}
            className="hover:text-foreground transition-colors"
            data-testid={`link-location-email-${location.code.toLowerCase()}`}
          >
            {location.email}
          </a>
        </span>
      </div>
    </div>
  );
}

export default function ContactUsInfo({ data }: ContactUsInfoProps) {
  return (
    <section
      style={sectionBackgroundStyle(data.background)}
      data-testid="section-contact-us-info"
    >
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 md:gap-12 lg:gap-0 justify-between">
          <div className="w-full lg:w-[59%]">
            {data.title && (
              <h2
                className="text-2xl font-bold text-foreground mb-6"
                data-testid="text-contact-title"
              >
                {data.title}
              </h2>
            )}
            {data.description && (
              <p
                className="text-muted-foreground mb-6"
                data-testid="text-contact-description"
              >
                {data.description}
              </p>
            )}
            <Suspense fallback={<LeadFormFallback />}>
              <LeadForm data={data.form} />
            </Suspense>
          </div>

          <div className="flex flex-col items-center lg:items-end lg:justify-end px-4 rounded-lg p-3">
            {data.locations_title && (
              <h3
                className="text-xl font-semibold text-foreground mb-4"
                data-testid="text-locations-title"
              >
                {data.locations_title}
              </h3>
            )}
            <div className="md:grid md:grid-cols-2 lg:grid-cols-none md:mx-8 lg:mx-0" data-testid="list-contact-locations">
              {data.locations.map((loc) => (
                <LocationCard key={loc.code} location={loc} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
