const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

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
    <section className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm flex items-center justify-between gap-5 flex-wrap">
      <div className="flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-linear-to-br from-violet-600 to-purple-500 flex items-center justify-center shrink-0">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-white" style={JAKARTA_FONT}>
              {profile.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <h4 className="font-bold text-xl text-gray-900" style={JAKARTA_FONT}>
            {profile.name}
          </h4>
          <p className="text-sm text-gray-500 mt-0.5">{profile.email}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onEditProfile}
        className="bg-white text-gray-700 font-medium px-4 py-2.5 rounded-xl text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
      >
        Edit Profile
      </button>
    </section>
  )
}
