import { TestimonialsSection } from "@/components/testimonials/variants/TestimonialsDefault";

export default function TestimonialsSectionExample() {
  const testimonials = [
    {
      id: '1',
      name: 'Sarah Johnson',
      role: 'Software Engineer',
      course: 'Full Stack Web Development',
      rating: 5,
      comment: 'This course completely transformed my career. The instructors are incredibly knowledgeable and the curriculum is perfectly structured.',
    },
    {
      id: '2',
      name: 'Michael Chen',
      role: 'Data Analyst',
      course: 'Data Science & Analytics',
      rating: 5,
      comment: 'Best investment I ever made. Got a job offer before even finishing the program!',
    },
    {
      id: '3',
      name: 'Emily Rodriguez',
      role: 'ML Engineer',
      course: 'AI & Machine Learning',
      rating: 4,
      comment: 'Excellent content and great support from mentors. The projects were challenging but rewarding.',
    },
  ];

  return (
    <div className="bg-background">
      <TestimonialsSection testimonials={testimonials} />
    </div>
  );
}
