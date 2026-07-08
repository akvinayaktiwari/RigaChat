import React from "react";
import { motion } from "motion/react";
import { Star } from "lucide-react";

export default function Testimonials() {
  const mainReviews = [
    {
      id: "review1",
      quote: "Most of our chats are sales-related, and we've seen a significant uptick in sales since implementing RigaChat.",
      author: "Milena Wojewoda",
      role: "Digital Project Specialist, Sephora",
      avatar: "https://lh3.googleusercontent.com/aida/AP1WRLvJbkQPBp6bUjUE6lptZEFzgTW8BTcIrOjd0wHKHEzYX26ORkXkvMK_b2qpo48lZzjugLXvi2dCXEO-UzwEMIK8ZyhkK3RY0J_g2S4W-XaCvSYMCwQ17zmYdpJDQ0AIbzt6fUZLXrCuR5UHXsPjiGs2DTr8EP96t02ku8zW5izgj55D09K1OUZfkeYyMdv1NYUZTd5NvDbm-WSTN7TfwQqmURgCuDCb4xKw9iFV6oma1aVPkSxkgDaYOuY",
    },
    {
      id: "review2",
      quote: "It allows our customers to book property showings instantly, which is perfect for their tight schedules.",
      author: "Kamran Zand",
      role: "Owner, Luxury Estates International",
      avatar: "https://lh3.googleusercontent.com/aida/AP1WRLtLROCaq1wg9QmAHQzawDiq-geOeX6ObPREtjTUf26vcxSdHtjKShIIrqfwNk3mjEMclWEis5E2LJSYrxVZDZKSuPvMVUNmkPZOzUv2aS0aMuwqUMihw7KsUCnUZSHYd6YKkAi2blNOmEljk_dmAu1x6ndgbYoRAl3bq51J8WRsdRelNCGS-MUhQ-n7CYbvXil-FObKvE_zuaa8vED38Me6j1llwGEN5bdz-MJ56Qn783gHWRd79-S5_A",
    },
  ];

  const microReviews = [
    {
      quote: "LOVE this app! Helped sales and engagement instantly.",
      brand: "The Cake Planner 🇺🇸",
    },
    {
      quote: "Absolutely recommend for the level of reporting.",
      brand: "MONTBLANC LMDM 🇦🇺",
    },
    {
      quote: "Really increase conversion rate! Strong recommend.",
      brand: "ÓRTTU 🇺🇸",
    },
  ];

  return (
    <section className="py-24 px-6 lg:px-8 bg-background" id="testimonials">
      <div className="max-w-7xl mx-auto">
        {/* Header Title */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight mb-4">
            Proven results for global teams
          </h2>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
            Don't just take our word for it. Join thousands of businesses that have transformed their sales process.
          </p>
        </div>

        {/* Major Reviews Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {mainReviews.map((review) => (
            <motion.div
              key={review.id}
              whileHover={{ y: -6 }}
              className="glass-card p-8 md:p-10 rounded-3xl flex flex-col justify-between border border-outline-variant/30 relative"
              id={`testimonial-main-${review.id}`}
            >
              <div>
                {/* 5-Star Rating */}
                <div className="flex gap-1 text-yellow-500 mb-6">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-500 stroke-yellow-500" />
                  ))}
                </div>
                {/* Quote */}
                <p className="text-xl md:text-2xl font-bold leading-relaxed text-on-background">
                  "{review.quote}"
                </p>
              </div>

              {/* Author Footer */}
              <div className="flex items-center gap-4 mt-8 pt-6 border-t border-outline-variant/20">
                <img
                  src={review.avatar}
                  alt={review.author}
                  className="w-14 h-14 rounded-full object-cover shadow-sm border border-outline-variant/30"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h4 className="font-extrabold text-base text-on-surface">{review.author}</h4>
                  <p className="text-xs text-on-surface-variant font-medium mt-0.5">{review.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bento Grid Micro Reviews */}
        <div className="grid sm:grid-cols-3 gap-6 mt-10">
          {microReviews.map((micro, idx) => (
            <div
              key={idx}
              className="p-6 bg-surface-container-low/60 rounded-2xl border border-outline-variant/15 flex flex-col justify-between"
              id={`testimonial-micro-${idx}`}
            >
              <p className="italic text-on-surface-variant text-sm leading-relaxed mb-4">
                "{micro.quote}"
              </p>
              <p className="font-bold text-xs text-on-surface/90 uppercase tracking-wider">
                {micro.brand}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
