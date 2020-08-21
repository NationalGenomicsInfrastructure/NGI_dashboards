import click
import yaml
import json
import os
import logging
from couchdb import Server
from datetime import datetime
from kpiupdater import ProjectViewsIter, sequencing_load, sequencing_success
from kpiupdater.kpi import *

script_dir = os.path.dirname(os.path.realpath(__file__))
with open (os.path.join(os.path.dirname(script_dir), 'version.txt')) as f:
    p_version = f.read()

logging.basicConfig(level=logging.WARNING,
                    format='[%(levelname)s] [%(asctime)s]: %(message)s',
                    datefmt='%a, %d %b %Y %H:%M:%S')

@click.command()
@click.option("--couch_user", "-u", required=True)
@click.password_option(required=True)
@click.option("--couch_server", "-s", required=True)
def update_kpi(couch_user, password, couch_server):
    """
    Connect to StatusDB projects and flowcell databases and
    compute current KPIs to be added to a new document in the kpi database.
    This script should be run every hour, and it should have a yaml configuration
    file in '$HOME/.dashbordrc' with program parameters:

        couch_user: foo_user

        password: bar_password

        couch_server: baz_couch.server:port
    """

    couch = Server("http://{}:{}@{}".format(couch_user, password, couch_server))
    if couch:
        projects_db = couch["projects"]
        worksets_db = couch["worksets"]
        kpi_db = couch["kpi"]
        bioinfo_db = couch["bioinfo_analysis"]
    else:
        raise IOError("Cannot connect to couchdb")

    p_summary = projects_db.view('project/summary')
    p_samples = projects_db.view('project/samples')
    p_dates = projects_db.view('project/summary_dates', group_level=1)
    w_proj = worksets_db.view('project/ws_proj')
    # Temporary measure to investigate intermittent issue Aug-2020
    for i in range(0,2):
        if len(w_proj) == 0:
            w_proj = worksets_db.view('project/ws_proj')
    b_samples = bioinfo_db.view('genomics_dashboard/run_lane_sample_status')

    kpis = {}
    kpis["s_initqc"] = SuccessInitialQC()
    kpis["s_libprep"] = SuccessLibraryPrep()
    kpis["s_bioinfo"] = SuccessBioinfo()
    kpis["p_finlib"] = ProjectsFinishedLib()
    kpis["p_libprep"] = ProjectsLibraryPrep()
    kpis["p_inprod"] = ProjectsInProduction()
    kpis["p_inapp"] = ProjectsInApplications()
    kpis["p_oseven"] = ProjectsOpenedLastSeven()
    kpis["p_cseven"] = ProjectsClosedLastSeven()
    kpis["p_onweeks"] = ProjectsOpenedNWeeks()
    kpis["p_cnweeks"] = ProjectsClosedNWeeks()
    kpis["pl_rcsamples"] = LoadInitialQCSamples()
    kpis["pl_rclanes"] = LoadInitialQCLanes()
    kpis["pl_libprepq"] = LoadLibraryPrepQueue()
    kpis["pl_libprep"] = LoadLibraryPrep()
    kpis["pl_bioinfoq"] = LoadBioinfoQueue()
    kpis["pl_bioinfo"] = LoadBioinfo()
    kpis["t_libprep"] = TaTLibprep()
    kpis["t_initqc"] = TaTInitialQC()
    kpis["t_libproj"] = TaTLibprepProj()
    kpis["t_finproj"] = TaTFinlibProj()
    kpis["t_seq"] = TaTSequencing()
    kpis["t_bioinfo"] = TaTBioinformatics()
    kpis["t_libprep_90th"] = TaTLibprep_90th()
    kpis["t_initqc_90th"] = TaTInitialQC_90th()
    kpis["t_libproj_90th"] = TaTLibprepProj_90th()
    kpis["t_finproj_90th"] = TaTFinlibProj_90th()
    kpis["t_seq_90th"] = TaTSequencing_90th()
    kpis["t_bioinfo_90th"] = TaTBioinfo_90th()

    logging.info("Generating KPIs")
    for proj_key, doc in ProjectViewsIter(p_summary, p_samples, p_dates, w_proj, b_samples):
        logging.debug("Processing project: {}".format(proj_key))
        for kpiobj in kpis.values():
            try:
                kpiobj(doc)
            except:
                logging.debug("Exception in processing {} - {}".format(proj_key, kpiobj.__class__))
                pass

    logging.info("Generating KPIs from lims")
    pl_seq = sequencing_load()

    logging.info("Summarizing KPIs")
    out = {}
    utc_time = "{}+0000".format(datetime.isoformat(datetime.utcnow()))
    limit_file = os.path.join(os.path.dirname(__file__), "config/limits.json")
    out["time_created"] = utc_time
    out["version"] = p_version
    with open(limit_file, "rU") as f:
        out["limits"] = json.load(f)
    #GAH! Too much repetition! I should probably rewrite this part
    out["process_load"] = {
            "initial_qc_samples": kpis["pl_rcsamples"].summary(),
            "initial_qc_lanes": kpis["pl_rclanes"].summary(),
            "library_prep": kpis["pl_libprep"].summary(),
            "library_prep_queue": kpis["pl_libprepq"].summary(),
            "bioinformatics_queue": kpis["pl_bioinfoq"].summary(),
            "bioinformatics": kpis["pl_bioinfo"].summary(),
            "miseq_pooling_queue": pl_seq[0],
            "miseq_sequencing_queue_p": pl_seq[1],
            "miseq_sequencing_queue_l": pl_seq[2],
            "hiseqX_pooling_queue": pl_seq[3],
            "hiseqX_sequencing_queue_p": pl_seq[4],
            "hiseqX_sequencing_queue_l": pl_seq[5],
            "hiseqX_sequencing_l": pl_seq[6],
            "miseq_sequencing_l": pl_seq[7],
            "novaseq_pooling_queue": pl_seq[8],
            "novaseq_sequencing_queue_p": pl_seq[9],
            "novaseq_sequencing_queue_l": pl_seq[10],
            "novaseq_sequencing_l": pl_seq[11]
    }
    out["success_rate"] = {
            "initial_qc": kpis["s_initqc"].summary(),
            "library_prep": kpis["s_libprep"].summary(),
            "sequencing": sequencing_success(),
            "bioinformatics": kpis["s_bioinfo"].summary()
    }
    out["turnaround_times"] = {
            "library_prep": kpis["t_libprep"].summary(),
            "initial_qc": kpis["t_initqc"].summary(),
            "finished_library_project": kpis["t_finproj"].summary(),
            "library_prep_project": kpis["t_libproj"].summary(),
            "bioinformatics": kpis["t_bioinfo"].summary(),
            "sequencing": kpis["t_seq"].summary(),
            "library_prep_90th": kpis["t_libprep_90th"].summary(),
            "initial_qc_90th": kpis["t_initqc_90th"].summary(),
            "finished_library_project_90th": kpis["t_finproj_90th"].summary(),
            "library_prep_project_90th": kpis["t_libproj_90th"].summary(),
            "bioinformatics_90th": kpis["t_bioinfo_90th"].summary(),
            "sequencing_90th": kpis["t_seq_90th"].summary()

    }
    out["projects"] = {
            "opened_last_7_days": kpis["p_oseven"].summary(),
            "in_applications": kpis["p_inapp"].summary(),
            "closed_last_7_days": kpis["p_cseven"].summary(),
            "in_production": kpis["p_inprod"].summary(),
            "opened_n_weeks_ago": kpis["p_onweeks"].summary(),
            "closed_n_weeks_ago": kpis["p_cnweeks"].summary(),
            "finished_libraries": kpis["p_finlib"].summary(),
            "library_prep": kpis["p_libprep"].summary()
    }
    kpi_db.create(out)

if __name__ == '__main__':
    try:
        conf_file = os.path.join(os.environ.get('HOME'), '.dashboardrc')
        with open(conf_file, "r") as f:
            config = yaml.load(f, Loader=yaml.SafeLoader)
    except IOError:
        click.secho("Could not open the config file {}".format(conf_file), fg="red")
        config = {}
    update_kpi(default_map=config)
