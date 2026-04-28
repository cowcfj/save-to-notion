/**
 * Save-time destination profile resolver for the background runtime.
 */

import {
  AccountGatedDestinationEntitlementProvider,
  DESTINATION_PROFILE_ERRORS,
  ensureMigratedDefaultProfile,
  LocalDestinationProfileRepository,
} from './ProfileStore.js';

export class ProfileResolver {
  constructor(options = {}) {
    this.repository =
      options.repository ||
      new LocalDestinationProfileRepository({ chromeStorage: options.chromeStorage });
    this.entitlementProvider =
      options.entitlementProvider || new AccountGatedDestinationEntitlementProvider();
  }

  async ensureMigratedDefaultProfile() {
    return await ensureMigratedDefaultProfile(this.repository);
  }

  async getDestinationEntitlement() {
    return await this.entitlementProvider.getDestinationEntitlement();
  }

  async setLastUsedProfile(profileId) {
    const profiles = await this.ensureMigratedDefaultProfile();
    const profile = profiles.find(item => item.id === profileId);
    if (!profile) {
      throw new Error(DESTINATION_PROFILE_ERRORS.NOT_FOUND);
    }
    await this.repository.setLastUsedProfileId(profile.id);
    return profile;
  }

  async resolveProfileForSave(profileId) {
    const profiles = await this.ensureMigratedDefaultProfile();
    if (profiles.length === 0) {
      throw new Error(DESTINATION_PROFILE_ERRORS.NOT_CONFIGURED);
    }

    const requestedProfileId =
      profileId || (await this.repository.getLastUsedProfileId()) || profiles[0].id;
    const profileIndex = profiles.findIndex(profile => profile.id === requestedProfileId);
    if (profileIndex === -1) {
      throw new Error(DESTINATION_PROFILE_ERRORS.NOT_FOUND);
    }

    const entitlement = await this.getDestinationEntitlement();
    if (profileIndex >= entitlement.maxProfiles) {
      throw new Error(DESTINATION_PROFILE_ERRORS.NOT_ALLOWED);
    }

    return profiles[profileIndex];
  }
}
