import { motion } from "motion/react";

export default function SocialProof() {
  const logos = [
    {
      id: "logo1",
      src: "https://lh3.googleusercontent.com/aida-public/AB6AXuAoshpn9C1OX5tley2n3-bbJ2onzZvuRXuBP2LnHju1WtgZHg7VpdBBB1hcXx-EOozC83i5NxbEBTfdBwQLb6ViUhWMtIlEg0ugIzUH-ygqiywc2icZTEeUpGLNH0UOsf_nJSdyOnI2u9FkrIwk9poMsKSn1NRWE-It4nIMn5vKBTuxAkHx8xj5MzoElshjPNppk69A_UJIdz3--elsM-tiRsM7WCtFEimwjo0iK7gIOfVZfzZS-YDr",
      alt: "Global tech client logo",
    },
    {
      id: "logo2",
      src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCgXYSQUdaQfMe_hciQCrfwxCTGYFAEBgRfIoaWbRAKVwvDz3wWmlDOHiEjQHY4hSSDhDpZM9uJNWiRkbHrx43ADn_8ONWk1xl5whAp3UcrHaRDknBHlT8cBKPS35U5Ik5Yiq0LqJy3O8DH-gpMWYDoZ1Tqpd09T_1oY4-I67IkvzNsIKYjOntjlOxBPIkkX1v3qTzvUUtYhSmsZWSLcbv2TOHMoUKJLflHyfUn1pBNAQg65ErYvBU2",
      alt: "Logistics provider client logo",
    },
    {
      id: "logo3",
      src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCNfLoT92Dn7xLZ5Kvu7sF7U46LuuXarNwvxflayeSBKBdpX-C8loJWg_xlDdwVPS42rjPr3SNUntVFmj9zrg-pa3LLD7CR0gjgG4yp0RrWUN_SnmwChgWtFmSX5nL2zkNUi5L_MmBtOC9EwpxTodnYwno6Y4CZ26j7Cj558OvFruHL5SnDNjVjiZnrsMBxgiZ4E6Wa0D0RxSsyBvds1GFEcMJRnMj1gMvjGzRcjsOSWzwEkKq9crn1",
      alt: "Financial services client logo",
    },
    {
      id: "logo4",
      src: "https://lh3.googleusercontent.com/aida-public/AB6AXuAjCwGIPfaRE3omELz_y0YYCTNz2rEcPB_fPht29HUQbZeJsF8dQ6tRL7npwSzNsxBTgFFrHVo7WXepy4i6FcjRQ4Y2jHfgLFvlGEoc7WcQkqTbBFp2MS4PKj9oAUQBfiWEYd3EbAygV8m-ZWUm_RkaeYBQOoXipkSahWEVL1pZdhTK-DpqY-qOf01zHJvkI-PDGo2aTR6X67jhK55iek8B0W5mWXvrs-EyfZWMFiWGR7Ikp_s1x8zl",
      alt: "Retail merchant client logo",
    },
    {
      id: "logo5",
      src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCHfDdAWGRIMyDcPAjbGw-5SYG1e5UYCCS-vcMKRFa0qIqWmP7dXTQ7M5rULszd1HMiFQzfXPasi41GquzpOnbsRQiJtvVlXNOGZKomv1yvWQpXc8J7R7tdIVCsM3jro9kKtSy0wA8wM_Zi7DsUUJ9IQi-CCz-qhYvuBteOdD76No9d6xpQ9M35oX1-7HamBRvuJWXciiFXfsut9teCDzErjNyh6CkfJyyCY2saWljcPh-gPkI-XOEz",
      alt: "Creative firm client logo",
    },
    {
      id: "logo6",
      src: "https://lh3.googleusercontent.com/aida-public/AB6AXuAgG7nxbFiGVmLRw8gulAe1IEDtifCO4TDI1bv50KkoHR3lVw_1HnTmIh842OjO86pEWBNixb-b4qrcitCuy07IUJT2ZEBEhuCEYDqr0Jus33ju3WdYZV_nq_3D23DmogKuM1_ZySg_VCnTq8A2bN2dXP1beZNbOEzI8PXWHhBKlRtAa0d-L1HC4UalVaKqH8VDbvic7wUC6Ov5xLOjrP-JRyKIbFhaZQGcQDpXC0Y44P1DJeLofevI",
      alt: "Technology partner logo",
    },
  ];

  return (
    <section className="py-14 bg-surface-container-low/40 border-y border-outline-variant/15">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant/85 mb-8">
          Trusted by 35,000+ businesses worldwide
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-8 gap-y-10 items-center justify-items-center">
          {logos.map((logo, index) => (
            <motion.div
              key={logo.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              whileHover={{ scale: 1.05 }}
              className="w-full flex items-center justify-center opacity-40 hover:opacity-100 transition-all duration-300 select-none grayscale hover:grayscale-0"
              id={`social-logo-container-${logo.id}`}
            >
              <img
                src={logo.src}
                alt={logo.alt}
                className="max-h-8 md:max-h-9 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
