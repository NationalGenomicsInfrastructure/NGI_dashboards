#!/usr/bin/env python

"""
Script to get data_internal from KPI data_internalbase and render dashboard HTML files.
"""

import click
from datetime import datetime
from distutils.dir_util import copy_tree
import logging
import jinja2
import json
import os
import urllib.request
import yaml

logging.basicConfig(level=logging.WARNING,
                    format='[%(levelname)s] [%(asctime)s]: %(message)s',
                    datefmt='%a, %d %b %Y %H:%M:%S')

# Get package version
script_dir = os.path.dirname(os.path.realpath(__file__))
with open (os.path.join(os.path.dirname(script_dir), 'version.txt')) as f:
    p_version = f.read()

# Command line options
@click.command(context_settings=dict(help_option_names=['-h', '--help']))
@click.option('--outdir', '-o', required=True, help = "Create dashboards in the specified output directory.")
@click.option('--genstat_url', '-g', default="https://genomics-status.scilifelab.se")
@click.version_option(p_version)
def make_dashboards(outdir, genstat_url):
    """
    Function to get data_internal from KPI data_internalbase and render dashboard HTML files.
    """

    ### CONFIGURATION VARS
    templates_dir = os.path.join(script_dir, 'templates')
    outdir = os.path.realpath(outdir)
    logging.info("Making reports in {}".format(outdir)) #TODO: logging not printing
    # Paths relative to make_dashboards/templates/
    external_fn = os.path.join('external','index.html')
    ngi_website_fn = os.path.join('ngi_website','index.html')


    ### GET THE EXTERNAL DATA
    external_url = '{}/api/v1/stats'.format(genstat_url)
    with urllib.request.urlopen(external_url) as url:
        data_external = json.loads(url.read().decode('utf-8'))
    data_external['date_rendered'] = datetime.now().strftime("%Y-%m-%d, %H:%M")
    data_external['p_version'] = p_version
    # Translations for lowercase keys
    with open("key_names.yaml", 'r') as f:
        data_external['key_names'] = yaml.load(f, Loader=yaml.SafeLoader)

    data_external['json'] = json.dumps(data_external, indent=4)

    ### GET THE DELIVERY TIMES DATA
    dtimes_url = '{}/api/v1/stats/year_deliverytime_application'.format(genstat_url)
    with urllib.request.urlopen(dtimes_url) as url:
        dtimes = json.loads(url.read().decode('utf-8'))
    dtimes_json = json.dumps(dtimes, indent=4)

    ### RENDER THE TEMPLATES

    # Copy across the templates - needed so that associated assets are there
    copy_tree(templates_dir, outdir)

    # Load the templates
    try:
        env = jinja2.Environment(loader=jinja2.FileSystemLoader(templates_dir))
        external_template = env.get_template(external_fn)
        ngi_website_template = env.get_template(ngi_website_fn)
    except:
        raise IOError ("Could not load dashboard template files")

    # Render templates and save
    external_output_fn = os.path.join(outdir, external_fn)
    ngi_website_output_fn = os.path.join(outdir, ngi_website_fn)

    # External template
    external_output = external_template.render(d=data_external, dt_data=dtimes_json)
    try:
        with open(os.path.join(outdir, external_output_fn), 'w') as f:
            print(external_output, file=f)
    except IOError as e:
        raise IOError ("Could not print report to '{}' - {}".format(external_output_fn, IOError(e)))

    # ngi_website template
    ngi_website_output = ngi_website_template.render(d=data_external, dt_data=dtimes_json)
    try:
        with open(os.path.join(outdir, ngi_website_output_fn), 'w') as f:
            print(ngi_website_output, file=f)
    except IOError as e:
        raise IOError ("Could not print report to '{}' - {}".format(ngi_website_output_fn, IOError(e)))



if __name__ == '__main__':
    try:
        conf_file = os.path.join(os.environ.get('HOME'), '.dashboardrc')
        with open(conf_file, "r") as f:
            config = yaml.load(f, Loader=yaml.SafeLoader)
    except IOError:
        click.secho("Could not open the config file {}".format(conf_file), fg="red")
        config = {}
    make_dashboards(default_map=config)
