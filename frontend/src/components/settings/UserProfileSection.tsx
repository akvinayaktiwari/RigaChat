import { Camera, ShieldCheck } from 'lucide-react'

interface Profile {
  name: string
  email: string
  avatarUrl?: string
}

interface UserProfileSectionProps {
  profile: Profile
  onEditProfile: () => void
}

export default function UserProfileSection({ profile, onEditProfile }: UserProfileSectionProps) {
  return (
    <section className="bg-white rounded-2xl border border-outline-variant p-6 md:p-8 hover:shadow-md transition-all duration-300">
      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
        <div className="relative shrink-0">
          <div className="w-32 h-32 rounded-full border-4 border-surface-container-low overflow-hidden">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary text-on-primary text-4xl font-bold flex items-center justify-center">
                {profile.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onEditProfile}
            title="Update Profile Photo"
            className="absolute bottom-1 right-1 w-8 h-8 bg-primary hover:bg-primary-container text-on-primary rounded-full flex items-center justify-center shadow-lg border-2 border-white transition-all duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 text-center md:text-left space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="text-2xl font-bold text-on-surface tracking-tight">{profile.name}</h4>
              <p className="text-sm text-on-surface-variant mt-0.5">{profile.email}</p>
            </div>

            <button
              type="button"
              onClick={onEditProfile}
              className="px-5 py-2 bg-surface-container-low hover:bg-surface-container border border-outline-variant text-primary font-bold text-xs rounded-xl transition-all duration-150 self-center md:self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Edit Profile
            </button>
          </div>

          <div className="flex flex-wrap gap-2.5 justify-center md:justify-start pt-1">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] uppercase tracking-wider border border-emerald-100">
              <ShieldCheck className="w-3.5 h-3.5" />
              Account Verified
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
